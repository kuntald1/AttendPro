from fastapi import APIRouter, Depends, HTTPException, Body, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import date, datetime
import logging
import numpy as np
from app.core.database import get_db
from app.core.security import get_current_user, require_roles
from app.models.user import Employee, AttendanceLog, StatusEnum, MarkMethodEnum, ScanLog
from app.schemas.schemas import AttendanceLogOut, ManualAttendanceCreate, DashboardStats
from app.services.face_service import face_service
from app.core.shift_utils import get_effective_shift_times, get_effective_work_hours

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/attendance", tags=["attendance"])


@router.post("/face/register/{emp_id}")
async def register_face(
    emp_id: int,
    payload: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin", "hr"))
):
    result = await db.execute(select(Employee).where(Employee.id == emp_id))
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Accept either multiple shots ("images": [...]) for a more robust
    # averaged reference, or a single legacy "image" for backward compat.
    images = payload.get("images")
    if not images:
        single = payload.get("image")
        images = [single] if single else []
    if not images:
        raise HTTPException(status_code=400, detail="No image provided")

    embeddings = []
    failures = []
    for idx, image_data in enumerate(images):
        success, embedding, msg = face_service.process_frame(image_data)
        if success:
            embeddings.append(embedding)
        else:
            failures.append(f"Shot {idx + 1}: {msg}")

    if not embeddings:
        return {
            "success": False,
            "message": "Could not detect a face in any of the captured photos. " + "; ".join(failures),
        }

    if len(embeddings) < len(images):
        logger.warning(
            f"Face registration for emp {emp_id}: only {len(embeddings)}/{len(images)} shots usable"
        )

    # Average across all usable shots - makes the stored reference more
    # robust to a single shot's lighting/angle/background quirks
    avg_embedding = np.mean(np.array(embeddings), axis=0).tolist()

    emp.face_embedding = avg_embedding
    emp.face_registered = True
    await db.flush()
    await db.commit()

    quality_note = f" ({len(embeddings)}/{len(images)} shots used)" if len(images) > 1 else ""
    return {"success": True, "message": f"Face registered for {emp.full_name}{quality_note}"}


@router.post("/face/recognize")
async def recognize_face(
    payload: dict = Body(...),
    db: AsyncSession = Depends(get_db),
):
    image_data = payload.get("image")
    if not image_data:
        raise HTTPException(status_code=400, detail="No image provided")

    success, embedding, msg = face_service.process_frame(image_data)
    if not success:
        return {"success": False, "message": msg}

    result = await db.execute(
        select(Employee).where(
            Employee.face_registered == True,
            Employee.is_active == True
        )
    )
    employees = result.scalars().all()

    if not employees:
        return {"success": False, "message": "No registered employees found. Please register faces first."}

    best_match = None
    best_score = 0.0
    THRESHOLD = 0.60

    for emp in employees:
        if emp.face_embedding is None:
            continue
        score = face_service.cosine_similarity(embedding, emp.face_embedding)
        if score > best_score:
            best_score = score
            best_match = emp

    if best_match is None or best_score < THRESHOLD:
        return {"success": False, "message": f"Face not recognised. Best score: {round(best_score * 100, 1)}%. Please try again or contact HR."}

    today = date.today()
    now = datetime.now()

    existing = await db.execute(
        select(AttendanceLog).where(
            and_(AttendanceLog.employee_id == best_match.id, AttendanceLog.date == today)
        )
    )
    log = existing.scalar_one_or_none()

    if log is None:
        shift_result = await db.execute(
            select(Employee)
            .options(selectinload(Employee.shift))
            .where(Employee.id == best_match.id)
        )
        emp_with_shift = shift_result.scalar_one_or_none()
        shift = emp_with_shift.shift if emp_with_shift else None

        status = StatusEnum.present
        if shift:
            from datetime import timedelta
            grace = timedelta(minutes=shift.grace_minutes)
            eff_start, _ = get_effective_shift_times(shift, today)
            shift_start = datetime.combine(today, eff_start)
            now_naive = now.replace(tzinfo=None) if now.tzinfo else now
            if now_naive > shift_start + grace:
                status = StatusEnum.late

        log = AttendanceLog(
            employee_id=best_match.id,
            date=today,
            check_in_time=now,
            status=status,
            method=MarkMethodEnum.face
        )
        db.add(log)
        action = "checked_in"
    else:
        log.check_out_time = now
        action = "checked_out"
        
        # Check early leave
        early_leave = False
        early_leave_message = None
        if log.check_in_time and not best_match.exempt_early_leave:
            from app.models.settings import CompanySettings
            cs = (await db.execute(select(CompanySettings).limit(1))).scalar_one_or_none()
            if cs and cs.early_leave_enabled:
                shift_result = await db.execute(
                    select(Employee).options(selectinload(Employee.shift)).where(Employee.id == best_match.id)
                )
                emp_with_shift = shift_result.scalar_one_or_none()
                emp_shift = emp_with_shift.shift if emp_with_shift else None
                eff_work_hours = get_effective_work_hours(emp_shift, today)
                required_minutes = ((eff_work_hours if eff_work_hours else cs.work_hours) * 60) + cs.lunch_minutes
                cin = log.check_in_time.replace(tzinfo=None) if log.check_in_time.tzinfo else log.check_in_time
                actual_minutes = (now - cin).total_seconds() / 60
                if actual_minutes < required_minutes:
                    early_leave = True
                    log.early_leave = True
                    required_time = f"{int(required_minutes//60)}h {int(required_minutes%60)}m"
                    actual_time = f"{int(actual_minutes//60)}h {int(actual_minutes%60)}m"
                    early_leave_message = f"Early leave detected! Required: {required_time}, Worked: {actual_time}"

    # Log every scan
    scan_log = ScanLog(
        employee_id=best_match.id,
        scan_time=now,
        confidence=round(best_score * 100, 1),
        date=today
    )
    db.add(scan_log)

    await db.flush()
    await db.commit()

    result = {
        "success": True,
        "action": action,
        "employee": {
            "id": best_match.id,
            "name": best_match.full_name,
            "code": best_match.employee_code
        },
        "confidence": round(best_score * 100, 1),
        "time": now.strftime("%H:%M:%S")
    }
    if early_leave_message:
        result["warning"] = early_leave_message
    return result


@router.get("/today", response_model=List[AttendanceLogOut])
async def today_attendance(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    today = date.today()
    result = await db.execute(
        select(AttendanceLog)
        .options(
            selectinload(AttendanceLog.employee).selectinload(Employee.department),
            selectinload(AttendanceLog.employee).selectinload(Employee.shift)
        )
        .where(AttendanceLog.date == today)
        .order_by(AttendanceLog.check_in_time.desc())
    )
    return result.scalars().all()


@router.get("/logs", response_model=List[AttendanceLogOut])
async def attendance_logs(
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    employee_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user)
):
    query = select(AttendanceLog).options(
        selectinload(AttendanceLog.employee).selectinload(Employee.department),
        selectinload(AttendanceLog.employee).selectinload(Employee.shift)
    )
    if from_date:
        query = query.where(AttendanceLog.date >= from_date)
    if to_date:
        query = query.where(AttendanceLog.date <= to_date)
    if employee_id:
        query = query.where(AttendanceLog.employee_id == employee_id)
    result = await db.execute(query.order_by(AttendanceLog.date.desc()))
    return result.scalars().all()


@router.post("/manual", response_model=AttendanceLogOut)
async def manual_attendance(
    data: ManualAttendanceCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin", "hr", "manager"))
):
    existing = await db.execute(
        select(AttendanceLog).where(
            and_(
                AttendanceLog.employee_id == data.employee_id,
                AttendanceLog.date == data.date
            )
        )
    )
    log = existing.scalar_one_or_none()
    if log:
        log.status = data.status
        log.check_in_time = data.check_in_time
        log.check_out_time = data.check_out_time
        log.remarks = data.remarks
        log.method = MarkMethodEnum.manual
    else:
        log = AttendanceLog(**data.model_dump(), method=MarkMethodEnum.manual)
        db.add(log)
    await db.flush()
    await db.commit()
    result = await db.execute(
        select(AttendanceLog)
        .options(selectinload(AttendanceLog.employee))
        .where(AttendanceLog.id == log.id)
    )
    return result.scalar_one()


@router.get("/dashboard", response_model=DashboardStats)
async def dashboard_stats(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    today = date.today()
    total = (await db.execute(
        select(func.count(Employee.id)).where(Employee.is_active == True)
    )).scalar()
    logs_today = (await db.execute(
        select(AttendanceLog).where(AttendanceLog.date == today)
    )).scalars().all()
    present = sum(1 for l in logs_today if l.status == StatusEnum.present)
    late = sum(1 for l in logs_today if l.status == StatusEnum.late)
    on_leave = sum(1 for l in logs_today if l.status == StatusEnum.on_leave)
    absent = total - present - late - on_leave
    pct = round((present + late) / total * 100, 1) if total > 0 else 0.0
    return DashboardStats(
        total_employees=total,
        present_today=present,
        absent_today=absent,
        late_today=late,
        on_leave_today=on_leave,
        attendance_percentage=pct
    )




@router.get("/kiosk/check")
async def check_kiosk_device(request: Request, db: AsyncSession = Depends(get_db)):
    from app.models.settings import CompanySettings, KioskDevice, Office, EmployeeOffice
    client_ip = request.client.host
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()

    # Get global geofencing setting
    result = await db.execute(select(CompanySettings).limit(1))
    settings = result.scalar_one_or_none()
    geofencing_enabled = settings.geofencing_enabled if settings else False

    # Check registered kiosk devices
    devices = (await db.execute(select(KioskDevice))).scalars().all()

    # If no devices registered - open mode
    if not devices:
        return {
            "allowed": True,
            "mode": "open",
            "geofencing_enabled": False,
            "office_lat": None,
            "office_lng": None,
            "radius_meters": 50,
            "message": "Open mode"
        }

    # Check if this IP matches a registered kiosk
    matched_device = next((d for d in devices if d.ip == client_ip), None)

    if matched_device:
        # Physical kiosk - get its office GPS
        office_lat = None
        office_lng = None
        radius = 50
        if matched_device.office_id:
            office = (await db.execute(select(Office).where(Office.id == matched_device.office_id))).scalar_one_or_none()
            if office:
                office_lat = office.lat
                office_lng = office.lng
                radius = office.radius_meters
        return {
            "allowed": True,
            "mode": "kiosk",
            "geofencing_enabled": geofencing_enabled and office_lat is not None,
            "office_lat": office_lat,
            "office_lng": office_lng,
            "radius_meters": radius,
            "message": f"Authorised kiosk device"
        }

    # Not a registered kiosk IP - check if personal device mode (employee kiosk access)
    # This will be validated per-employee during recognition
    return {
        "allowed": False,
        "mode": "blocked",
        "geofencing_enabled": False,
        "office_lat": None,
        "office_lng": None,
        "radius_meters": 50,
        "message": f"Device {client_ip} is not a registered kiosk. Please use the office kiosk device."
    }


@router.get("/kiosk/employee-check")
async def check_employee_kiosk_access(request: Request, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    from app.models.settings import CompanySettings, EmployeeOffice, Office
    
    # Get employee's office assignment
    if not current_user.employee:
        raise HTTPException(status_code=403, detail="No employee profile found")
    
    emp_id = current_user.employee.id
    result = await db.execute(
        select(EmployeeOffice)
        .where(EmployeeOffice.employee_id == emp_id)
    )
    assignment = result.scalar_one_or_none()
    
    if not assignment:
        return {"allowed": False, "reason": "No office assigned. Contact HR.", "office_lat": None, "office_lng": None, "radius_meters": 50}
    
    if not assignment.kiosk_access:
        return {"allowed": False, "reason": "Kiosk access is disabled for your account. Please use the office kiosk device.", "office_lat": None, "office_lng": None, "radius_meters": 50}
    
    # Get office GPS
    if not assignment.office_id:
        return {"allowed": False, "reason": "No office location assigned. Contact HR.", "office_lat": None, "office_lng": None, "radius_meters": 50}
    
    office = (await db.execute(select(Office).where(Office.id == assignment.office_id))).scalar_one_or_none()
    if not office or not office.lat or not office.lng:
        return {"allowed": False, "reason": "Office location not configured. Contact admin.", "office_lat": None, "office_lng": None, "radius_meters": 50}
    
    # Get geofencing setting
    settings_result = await db.execute(select(CompanySettings).limit(1))
    company_settings = settings_result.scalar_one_or_none()
    geofencing_enabled = company_settings.geofencing_enabled if company_settings else False
    
    return {
        "allowed": True,
        "mode": "personal",
        "geofencing_enabled": geofencing_enabled,
        "office_lat": office.lat,
        "office_lng": office.lng,
        "radius_meters": office.radius_meters,
        "office_name": office.name,
        "employee_name": current_user.employee.full_name
    }


@router.post("/face/recognize-personal")
async def recognize_face_personal(
    payload: dict = Body(...),
    request: Request = None,
    db: AsyncSession = Depends(get_db)
):
    """Personal kiosk endpoint - checks kiosk_access permission after face recognition"""
    from app.models.settings import EmployeeOffice, Office
    import math

    image_data = payload.get("image")
    client_lat = payload.get("lat")
    client_lng = payload.get("lng")

    if not image_data:
        raise HTTPException(status_code=400, detail="No image provided")

    success, embedding, msg = face_service.process_frame(image_data)
    if not success:
        return {"success": False, "message": msg}
    if "No face" in msg or embedding is None:
        return {"success": False, "message": "No face detected. Please look at the camera."}

    result = await db.execute(
        select(Employee).where(Employee.face_registered == True, Employee.is_active == True)
    )
    employees = result.scalars().all()

    if not employees:
        return {"success": False, "message": "No registered employees found."}

    best_match = None
    best_score = 0.0
    THRESHOLD = 0.75  # Threshold for personal kiosk

    for emp in employees:
        if emp.face_embedding is None:
            continue
        score = face_service.cosine_similarity(embedding, emp.face_embedding)
        if score > best_score:
            best_score = score
            best_match = emp

    if best_match is None or best_score < THRESHOLD:
        logger.info(f"Personal kiosk: no match above threshold (best_score={best_score:.3f}, threshold={THRESHOLD}, closest={best_match.employee_code if best_match else 'none'})")
        return {"success": False, "message": f"Face not recognised. Please look directly at the camera."}
    logger.info(f"Personal kiosk: matched {best_match.employee_code} (score={best_score:.3f}, threshold={THRESHOLD})")

    # Check kiosk_access for this employee
    office_result = await db.execute(
        select(EmployeeOffice).where(EmployeeOffice.employee_id == best_match.id)
    )
    assignment = office_result.scalar_one_or_none()

    if not assignment or not assignment.kiosk_access:
        return {
            "success": False,
            "access_denied": True,
            "message": f"Personal kiosk access is not enabled for {best_match.full_name}. Please use the office gate kiosk."
        }

    # Check per-office geofencing
    if assignment.office_id:
        office = (await db.execute(select(Office).where(Office.id == assignment.office_id))).scalar_one_or_none()
        if office and office.geofencing_enabled and office.lat and office.lng:
            if client_lat is None or client_lng is None:
                return {
                    "success": False,
                    "access_denied": True,
                    "message": "Location access required for this office. Please allow GPS and try again."
                }
            R = 6371000
            lat1, lon1 = math.radians(client_lat), math.radians(client_lng)
            lat2, lon2 = math.radians(office.lat), math.radians(office.lng)
            dlat = lat2 - lat1
            dlon = lon2 - lon1
            a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
            dist = R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
            if dist > office.radius_meters:
                return {
                    "success": False,
                    "access_denied": True,
                    "message": f"You are {round(dist)}m away from {office.name}. Must be within {office.radius_meters}m."
                }

    # All checks passed - mark attendance
    today = date.today()
    now = datetime.now()

    existing = await db.execute(
        select(AttendanceLog).where(
            and_(AttendanceLog.employee_id == best_match.id, AttendanceLog.date == today)
        )
    )
    log = existing.scalar_one_or_none()

    if log is None:
        shift_result = await db.execute(
            select(Employee).options(selectinload(Employee.shift)).where(Employee.id == best_match.id)
        )
        emp_with_shift = shift_result.scalar_one_or_none()
        shift = emp_with_shift.shift if emp_with_shift else None
        status = StatusEnum.present
        if shift:
            from datetime import timedelta
            grace = timedelta(minutes=shift.grace_minutes)
            eff_start, _ = get_effective_shift_times(shift, today)
            shift_start = datetime.combine(today, eff_start)
            now_naive = now.replace(tzinfo=None) if now.tzinfo else now
            if now_naive > shift_start + grace:
                status = StatusEnum.late
        log = AttendanceLog(
            employee_id=best_match.id, date=today,
            check_in_time=now, status=status, method=MarkMethodEnum.face
        )
        db.add(log)
        action = "checked_in"
    else:
        log.check_out_time = now
        action = "checked_out"

    await db.flush()
    await db.commit()

    return {
        "success": True,
        "action": action,
        "employee": {"id": best_match.id, "name": best_match.full_name, "code": best_match.employee_code},
        "confidence": round(best_score * 100, 1),
        "time": now.strftime("%H:%M:%S")
    }


@router.get("/scan-logs")
async def get_scan_logs(
    date: Optional[date] = None,
    employee_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user)
):
    from app.models.user import ScanLog
    today = date or __import__('datetime').date.today()
    query = select(ScanLog).options(
        selectinload(ScanLog.employee)
    ).where(ScanLog.date == today)
    if employee_id:
        query = query.where(ScanLog.employee_id == employee_id)
    query = query.order_by(ScanLog.scan_time)
    result = await db.execute(query)
    logs = result.scalars().all()
    return [{
        "id": l.id,
        "employee_id": l.employee_id,
        "employee_name": l.employee.full_name,
        "employee_code": l.employee.employee_code,
        "scan_time": l.scan_time.strftime("%H:%M:%S"),
        "confidence": l.confidence,
        "date": str(l.date)
    } for l in logs]


@router.get("/manual-list")
async def manual_attendance_list(
    date: Optional[date] = None,
    employee_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin", "hr", "manager"))
):
    """Get all employees with their attendance for a date - for manual entry"""
    from datetime import date as date_type
    target_date = date or date_type.today()

    emp_query = select(Employee).options(
        selectinload(Employee.department),
        selectinload(Employee.shift)
    ).where(Employee.is_active == True)
    if employee_id:
        emp_query = emp_query.where(Employee.id == employee_id)

    employees = (await db.execute(emp_query)).scalars().all()

    result = []
    for emp in employees:
        log = (await db.execute(
            select(AttendanceLog).where(
                and_(AttendanceLog.employee_id == emp.id, AttendanceLog.date == target_date)
            )
        )).scalar_one_or_none()

        result.append({
            "employee_id": emp.id,
            "employee_code": emp.employee_code,
            "full_name": emp.full_name,
            "department": emp.department.name if emp.department else "—",
            "shift_name": emp.shift.name if emp.shift else "—",
            "shift_start": str(emp.shift.start_time) if emp.shift else None,
            "shift_end": str(emp.shift.end_time) if emp.shift else None,
            "log_id": log.id if log else None,
            "check_in_time": __import__('pytz').timezone('Asia/Kolkata').normalize(log.check_in_time.replace(tzinfo=__import__('pytz').utc) if log.check_in_time.tzinfo is None else log.check_in_time.astimezone(__import__('pytz').timezone('Asia/Kolkata'))).strftime("%H:%M") if log and log.check_in_time else None,
            "check_out_time": __import__('pytz').timezone('Asia/Kolkata').normalize(log.check_out_time.replace(tzinfo=__import__('pytz').utc) if log.check_out_time.tzinfo is None else log.check_out_time.astimezone(__import__('pytz').timezone('Asia/Kolkata'))).strftime("%H:%M") if log and log.check_out_time else None,
            "status": log.status.value if log else "absent",
            "remarks": log.remarks if log else None,
            "method": log.method.value if log else None,
        })

    return {"date": str(target_date), "employees": result}


@router.post("/manual-save")
async def manual_attendance_save(
    payload: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin", "hr", "manager"))
):
    """Save manual attendance entry for one employee"""
    from datetime import date as date_type, datetime as dt_type
    emp_id = payload.get("employee_id")
    target_date = date_type.fromisoformat(payload.get("date"))
    check_in_str = payload.get("check_in_time")
    check_out_str = payload.get("check_out_time")
    status = payload.get("status", "present")
    remarks = payload.get("remarks", "")

    # Parse times
    import datetime as dt_module
    import pytz
    check_in = None
    check_out = None
    try:
        ist = pytz.timezone('Asia/Kolkata')
    except Exception:
        ist = None
    if check_in_str:
        h, m = map(int, check_in_str.split(":"))
        naive_dt = dt_type.combine(target_date, dt_module.time(h, m))
        check_in = ist.localize(naive_dt) if ist else naive_dt
    if check_out_str:
        h, m = map(int, check_out_str.split(":"))
        naive_dt = dt_type.combine(target_date, dt_module.time(h, m))
        check_out = ist.localize(naive_dt) if ist else naive_dt

    existing = (await db.execute(
        select(AttendanceLog).where(
            and_(AttendanceLog.employee_id == emp_id, AttendanceLog.date == target_date)
        )
    )).scalar_one_or_none()

    if existing:
        existing.check_in_time = check_in
        existing.check_out_time = check_out
        existing.status = StatusEnum(status)
        existing.method = MarkMethodEnum.manual
        existing.remarks = remarks
    else:
        log = AttendanceLog(
            employee_id=emp_id,
            date=target_date,
            check_in_time=check_in,
            check_out_time=check_out,
            status=StatusEnum(status),
            method=MarkMethodEnum.manual,
            remarks=remarks
        )
        db.add(log)

    await db.flush()
    await db.commit()
    return {"success": True}
