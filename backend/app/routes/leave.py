from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, extract
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import datetime, date
from app.core.database import get_db
from app.core.security import get_current_user, require_roles
from app.models.user import LeaveRequest, LeaveType, Department, Shift, Employee, User
from app.models.settings import CompanySettings
from app.schemas.schemas import (
    LeaveRequestCreate, LeaveRequestOut, LeaveReviewRequest, LeaveTypeOut,
    DepartmentCreate, DepartmentOut, ShiftCreate, ShiftUpdate, ShiftOut
)
import logging

logger = logging.getLogger(__name__)

# ── Leave Router ───────────────────────────────────────────────
leave_router = APIRouter(prefix="/api/leave", tags=["leave"])


def _get_smtp_config():
    """Get SMTP config from DB."""
    try:
        import psycopg2
        conn = psycopg2.connect(host="db", port=5432, database="attendance_db", user="postgres", password="postgres123")
        cur = conn.cursor()
        cur.execute("SELECT smtp_host, smtp_port, smtp_user, smtp_password, smtp_from_name, admin_email, company_name, company_email FROM company_settings LIMIT 1")
        row = cur.fetchone()
        cur.close()
        conn.close()
        if row and row[2]:
            return {"host": row[0] or "smtp.gmail.com", "port": row[1] or 587,
                    "user": row[2], "password": row[3] or "",
                    "from_name": row[4] or "AttendPro System",
                    "admin_email": row[5] or "", "company_name": row[6] or "Your Company",
                    "company_email": row[7] or ""}
        return None
    except Exception as e:
        logger.warning(f"SMTP config error: {e}")
        return None


def _send_email(to_email: str, subject: str, html_body: str):
    """Send HTML email."""
    import smtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText
    cfg = _get_smtp_config()
    if not cfg or not cfg["user"] or not cfg["password"]:
        logger.warning("SMTP not configured — skipping email")
        return False
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{cfg['from_name']} <{cfg['user']}>"
        msg["To"] = to_email
        msg.attach(MIMEText(html_body, "html"))
        with smtplib.SMTP(cfg["host"], cfg["port"]) as server:
            server.starttls()
            server.login(cfg["user"], cfg["password"])
            server.sendmail(cfg["user"], to_email, msg.as_string())
        logger.info(f"Email sent to {to_email}: {subject}")
        return True
    except Exception as e:
        logger.error(f"Email failed to {to_email}: {e}")
        return False


def _leave_applied_email(emp_name: str, leave_type: str, from_date, to_date, reason: str, days: int, admin_email: str, company_name: str, leave_id: int):
    """Send leave application notification to admin with approve/reject links."""
    base_url = "http://localhost:3000"
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8faff;padding:20px;">
      <div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);padding:28px;border-radius:12px 12px 0 0;text-align:center;">
        <h2 style="color:white;margin:0;font-size:22px;">📋 New Leave Request</h2>
        <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:14px;">{company_name} — AttendPro Notification</p>
      </div>
      <div style="background:white;padding:28px;border-radius:0 0 12px 12px;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
        <p style="font-size:15px;color:#333;margin-bottom:20px;">A new leave request has been submitted and requires your review.</p>
        <div style="background:#f0f4ff;border-left:4px solid #2563eb;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
          <table style="width:100%;font-size:14px;border-collapse:collapse;">
            <tr><td style="color:#666;padding:4px 0;width:40%;">Employee</td><td style="font-weight:600;color:#1a1a2e;">{emp_name}</td></tr>
            <tr><td style="color:#666;padding:4px 0;">Leave Type</td><td style="font-weight:600;color:#1a1a2e;">{leave_type}</td></tr>
            <tr><td style="color:#666;padding:4px 0;">From Date</td><td style="font-weight:600;color:#1a1a2e;">{from_date}</td></tr>
            <tr><td style="color:#666;padding:4px 0;">To Date</td><td style="font-weight:600;color:#1a1a2e;">{to_date}</td></tr>
            <tr><td style="color:#666;padding:4px 0;">Total Days</td><td style="font-weight:700;color:#2563eb;">{days} day(s)</td></tr>
            <tr><td style="color:#666;padding:4px 0;">Reason</td><td style="color:#1a1a2e;">{reason or 'Not specified'}</td></tr>
          </table>
        </div>
        <p style="font-size:13px;color:#666;margin-bottom:20px;">Please log in to the admin panel to approve or reject this request:</p>
        <div style="text-align:center;margin:24px 0;">
          <a href="{base_url}/leave" style="background:#2563eb;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">
            🔍 Review Leave Request
          </a>
        </div>
        <p style="font-size:12px;color:#999;text-align:center;margin-top:20px;">Automated notification from AttendPro • {company_name}</p>
      </div>
    </div>
    """
    return html


def _leave_status_email(emp_name: str, leave_type: str, from_date, to_date, days: int, status: str, remarks: str, company_name: str):
    """Send leave status update to employee."""
    is_approved = status.lower() == "approved"
    color = "#16a34a" if is_approved else "#dc2626"
    bg = "#f0fdf4" if is_approved else "#fef2f2"
    icon = "✅" if is_approved else "❌"
    status_text = "APPROVED" if is_approved else "REJECTED"
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8faff;padding:20px;">
      <div style="background:linear-gradient(135deg,{color},{color}cc);padding:28px;border-radius:12px 12px 0 0;text-align:center;">
        <h2 style="color:white;margin:0;font-size:22px;">{icon} Leave Request {status_text}</h2>
        <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:14px;">{company_name} — AttendPro Notification</p>
      </div>
      <div style="background:white;padding:28px;border-radius:0 0 12px 12px;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
        <p style="font-size:15px;color:#333;">Dear <strong>{emp_name}</strong>,</p>
        <p style="font-size:14px;color:#555;">Your leave request has been <strong style="color:{color};">{status_text}</strong> by the admin.</p>
        <div style="background:{bg};border-left:4px solid {color};border-radius:8px;padding:16px 20px;margin:20px 0;">
          <table style="width:100%;font-size:14px;border-collapse:collapse;">
            <tr><td style="color:#666;padding:4px 0;width:40%;">Leave Type</td><td style="font-weight:600;">{leave_type}</td></tr>
            <tr><td style="color:#666;padding:4px 0;">From</td><td style="font-weight:600;">{from_date}</td></tr>
            <tr><td style="color:#666;padding:4px 0;">To</td><td style="font-weight:600;">{to_date}</td></tr>
            <tr><td style="color:#666;padding:4px 0;">Days</td><td style="font-weight:700;color:{color};">{days} day(s)</td></tr>
            {'<tr><td style="color:#666;padding:4px 0;">Remarks</td><td style="color:#333;">' + (remarks or 'None') + '</td></tr>' if remarks else ''}
          </table>
        </div>
        {'<p style="font-size:13px;color:#16a34a;background:#f0fdf4;padding:12px;border-radius:8px;">Your leave has been approved. Please ensure proper handover of work before your leave dates.</p>' if is_approved else '<p style="font-size:13px;color:#dc2626;background:#fef2f2;padding:12px;border-radius:8px;">Your leave request was not approved. Please contact HR for more information.</p>'}
        <p style="font-size:12px;color:#999;text-align:center;margin-top:24px;">Automated notification from AttendPro • {company_name}</p>
      </div>
    </div>
    """
    return html


async def _get_leave_balance(db: AsyncSession, employee_id: int, leave_type_id: int, year: int = None) -> dict:
    """Calculate leave balance for an employee."""
    if year is None:
        year = date.today().year

    # Get leave type quota
    lt_res = await db.execute(select(LeaveType).where(LeaveType.id == leave_type_id))
    lt = lt_res.scalar_one_or_none()
    if not lt:
        return {"allowed": 0, "used": 0, "remaining": 0}

    # Count approved/pending days used this year
    leaves_res = await db.execute(
        select(LeaveRequest).where(
            LeaveRequest.employee_id == employee_id,
            LeaveRequest.leave_type_id == leave_type_id,
            LeaveRequest.status.in_(["approved", "pending"]),
            extract("year", LeaveRequest.from_date) == year,
        )
    )
    leaves = leaves_res.scalars().all()
    used_days = sum((l.to_date - l.from_date).days + 1 for l in leaves)

    return {
        "allowed": lt.days_per_year,
        "used": used_days,
        "remaining": max(0, lt.days_per_year - used_days),
        "leave_type": lt.name,
        "is_paid": lt.is_paid,
    }


@leave_router.get("/types", response_model=List[LeaveTypeOut])
async def get_leave_types(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(select(LeaveType))
    return result.scalars().all()


@leave_router.get("/balance")
async def get_leave_balance(
    employee_id: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Get leave balance for an employee across all leave types."""
    if year is None:
        year = date.today().year

    # Determine which employee to query
    if employee_id and current_user.role in ["admin", "hr", "manager"]:
        emp_id = employee_id
    else:
        emp_res = await db.execute(select(Employee).where(Employee.user_id == current_user.id))
        emp = emp_res.scalar_one_or_none()
        if not emp:
            # Admin has no employee profile — return empty
            return {"year": year, "employee_id": None, "balances": []}
        emp_id = emp.id

    # Get all leave types
    lt_res = await db.execute(select(LeaveType))
    leave_types = lt_res.scalars().all()

    balances = []
    for lt in leave_types:
        bal = await _get_leave_balance(db, emp_id, lt.id, year)
        balances.append(bal)

    return {"year": year, "employee_id": emp_id, "balances": balances}


@leave_router.post("/apply", response_model=LeaveRequestOut)
async def apply_leave(
    data: LeaveRequestCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    emp_result = await db.execute(select(Employee).where(Employee.user_id == current_user.id))
    emp = emp_result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=400, detail="Employee profile not found")

    # Calculate days requested
    days_requested = (data.to_date - data.from_date).days + 1

    # Check for overlapping leave on same dates
    overlap_res = await db.execute(
        select(LeaveRequest).where(
            LeaveRequest.employee_id == emp.id,
            LeaveRequest.status != "rejected",
            LeaveRequest.from_date <= data.to_date,
            LeaveRequest.to_date >= data.from_date,
        )
    )
    if overlap_res.scalar_one_or_none():
        raise HTTPException(400, "You already have a leave request for overlapping dates.")

    # Check leave balance
    lt_res = await db.execute(select(LeaveType).where(LeaveType.id == data.leave_type_id))
    lt = lt_res.scalar_one_or_none()
    if not lt:
        raise HTTPException(400, "Invalid leave type")

    # Check balance only for paid leaves (LOP has 365 days limit)
    bal = await _get_leave_balance(db, emp.id, data.leave_type_id)
    if lt.is_paid and bal["remaining"] < days_requested:
        raise HTTPException(
            400,
            f"Insufficient {lt.name} balance. You have {bal['remaining']} day(s) remaining out of {bal['allowed']}. "
            f"You requested {days_requested} day(s). Please choose Loss of Pay or reduce the leave duration."
        )

    leave = LeaveRequest(
        employee_id=emp.id,
        leave_type_id=data.leave_type_id,
        from_date=data.from_date,
        to_date=data.to_date,
        reason=data.reason,
        status="pending",
    )
    db.add(leave)
    await db.flush()
    await db.commit()
    await db.refresh(leave)

    # Send email to admin
    try:
        cfg = _get_smtp_config()
        if cfg:
            cs_res = await db.execute(select(CompanySettings).limit(1))
            cs = cs_res.scalar_one_or_none()
            company_name = cs.company_name if cs else "Your Company"
            admin_email = cfg.get("admin_email") or cfg.get("company_email") or ""
            if admin_email:
                html = _leave_applied_email(
                    emp_name=emp.full_name,
                    leave_type=lt.name,
                    from_date=data.from_date,
                    to_date=data.to_date,
                    reason=data.reason or "",
                    days=days_requested,
                    admin_email=admin_email,
                    company_name=company_name,
                    leave_id=leave.id,
                )
                _send_email(
                    to_email=admin_email,
                    subject=f"Leave Request — {emp.full_name} | {lt.name} | {data.from_date}",
                    html_body=html,
                )
    except Exception as e:
        logger.error(f"Failed to send leave notification: {e}")

    # Reload with relations
    result = await db.execute(
        select(LeaveRequest)
        .options(
            selectinload(LeaveRequest.employee).selectinload(Employee.department),
            selectinload(LeaveRequest.employee).selectinload(Employee.shift),
            selectinload(LeaveRequest.leave_type)
        )
        .where(LeaveRequest.id == leave.id)
    )
    return result.scalar_one()


@leave_router.get("/", response_model=List[LeaveRequestOut])
async def list_leaves(
    status: Optional[str] = Query(None),
    employee_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    q = (
        select(LeaveRequest)
        .options(
            selectinload(LeaveRequest.employee).selectinload(Employee.department),
            selectinload(LeaveRequest.employee).selectinload(Employee.shift),
            selectinload(LeaveRequest.leave_type)
        )
        .order_by(LeaveRequest.applied_at.desc())
    )

    # Employees only see their own leaves
    if current_user.role == "employee":
        emp_res = await db.execute(select(Employee).where(Employee.user_id == current_user.id))
        emp = emp_res.scalar_one_or_none()
        if emp:
            q = q.where(LeaveRequest.employee_id == emp.id)
    elif employee_id:
        q = q.where(LeaveRequest.employee_id == employee_id)

    if status:
        q = q.where(LeaveRequest.status == status)

    result = await db.execute(q)
    return result.scalars().all()


@leave_router.patch("/{leave_id}/review", response_model=LeaveRequestOut)
async def review_leave(
    leave_id: int,
    data: LeaveReviewRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("admin", "hr", "manager"))
):
    result = await db.execute(
        select(LeaveRequest)
        .options(
            selectinload(LeaveRequest.employee).selectinload(Employee.department),
            selectinload(LeaveRequest.employee).selectinload(Employee.shift),
            selectinload(LeaveRequest.leave_type)
        )
        .where(LeaveRequest.id == leave_id)
    )
    leave = result.scalar_one_or_none()
    if not leave:
        raise HTTPException(status_code=404, detail="Leave request not found")

    leave.status = data.status.value
    leave.reviewed_at = datetime.utcnow()
    await db.flush()
    await db.commit()

    # Send status email to employee
    try:
        cfg = _get_smtp_config()
        if cfg and leave.employee:
            cs_res = await db.execute(select(CompanySettings).limit(1))
            cs = cs_res.scalar_one_or_none()
            company_name = cs.company_name if cs else "Your Company"
            days = (leave.to_date - leave.from_date).days + 1
            html = _leave_status_email(
                emp_name=leave.employee.full_name,
                leave_type=leave.leave_type.name if leave.leave_type else "Leave",
                from_date=leave.from_date,
                to_date=leave.to_date,
                days=days,
                status=data.status.value,
                remarks=getattr(data, 'remarks', '') or '',
                company_name=company_name,
            )
            _send_email(
                to_email=leave.employee.email,
                subject=f"Leave {data.status.value.upper()} — {leave.leave_type.name if leave.leave_type else 'Leave'} | {company_name}",
                html_body=html,
            )
    except Exception as e:
        logger.error(f"Failed to send leave status email: {e}")

    result2 = await db.execute(
        select(LeaveRequest)
        .options(
            selectinload(LeaveRequest.employee).selectinload(Employee.department),
            selectinload(LeaveRequest.employee).selectinload(Employee.shift),
            selectinload(LeaveRequest.leave_type)
        )
        .where(LeaveRequest.id == leave_id)
    )
    return result2.scalar_one()


@leave_router.get("/all-balances")
async def get_all_employee_balances(
    year: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin", "hr"))
):
    """Get leave balance summary for all employees — admin view."""
    if year is None:
        year = date.today().year

    emps_res = await db.execute(select(Employee).where(Employee.is_active == True))
    employees = emps_res.scalars().all()

    lt_res = await db.execute(select(LeaveType))
    leave_types = lt_res.scalars().all()

    result = []
    for emp in employees:
        emp_balances = []
        for lt in leave_types:
            bal = await _get_leave_balance(db, emp.id, lt.id, year)
            emp_balances.append(bal)
        result.append({
            "employee_id": emp.id,
            "employee_name": emp.full_name,
            "employee_code": emp.employee_code,
            "balances": emp_balances,
        })
    return {"year": year, "employees": result}


@leave_router.delete("/{leave_id}")
async def delete_leave(
    leave_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Employee can delete their own pending leave request."""
    result = await db.execute(
        select(LeaveRequest)
        .options(selectinload(LeaveRequest.employee))
        .where(LeaveRequest.id == leave_id)
    )
    leave = result.scalar_one_or_none()
    if not leave:
        raise HTTPException(404, "Leave request not found")
    # Only allow delete if pending and belongs to current user (or admin)
    if current_user.role == "employee":
        emp_res = await db.execute(select(Employee).where(Employee.user_id == current_user.id))
        emp = emp_res.scalar_one_or_none()
        if not emp or leave.employee_id != emp.id:
            raise HTTPException(403, "Not authorized")
        if leave.status != "pending":
            raise HTTPException(400, "Only pending leave requests can be cancelled")
    await db.delete(leave)
    await db.commit()
    return {"success": True}
async def get_all_employee_balances(
    year: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin", "hr"))
):
    """Get leave balance summary for all employees — admin view."""
    if year is None:
        year = date.today().year

    emps_res = await db.execute(select(Employee).where(Employee.is_active == True))
    employees = emps_res.scalars().all()

    lt_res = await db.execute(select(LeaveType))
    leave_types = lt_res.scalars().all()

    result = []
    for emp in employees:
        emp_balances = []
        for lt in leave_types:
            bal = await _get_leave_balance(db, emp.id, lt.id, year)
            emp_balances.append(bal)
        result.append({
            "employee_id": emp.id,
            "employee_name": emp.full_name,
            "employee_code": emp.employee_code,
            "department": emp.department_id,
            "balances": emp_balances,
        })

    return {"year": year, "employees": result}


# ── Department Router ──────────────────────────────────────────
dept_router = APIRouter(prefix="/api/departments", tags=["departments"])

@dept_router.get("/", response_model=List[DepartmentOut])
async def list_departments(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(select(Department))
    return result.scalars().all()

@dept_router.post("/", response_model=DepartmentOut)
async def create_department(
    data: DepartmentCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin", "hr"))
):
    dept = Department(**data.model_dump())
    db.add(dept)
    await db.flush()
    await db.commit()
    await db.refresh(dept)
    return dept

@dept_router.delete("/{dept_id}")
async def delete_department(
    dept_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin"))
):
    result = await db.execute(select(Department).where(Department.id == dept_id))
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    await db.delete(dept)
    await db.commit()
    return {"message": "Department deleted"}

# ── Shift Router ───────────────────────────────────────────────
shift_router = APIRouter(prefix="/api/shifts", tags=["shifts"])

@shift_router.get("/", response_model=List[ShiftOut])
async def list_shifts(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(select(Shift))
    return result.scalars().all()

@shift_router.post("/", response_model=ShiftOut)
async def create_shift(
    data: ShiftCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin", "hr"))
):
    shift = Shift(**data.model_dump())
    db.add(shift)
    await db.flush()
    await db.commit()
    await db.refresh(shift)
    return shift

@shift_router.patch("/{shift_id}", response_model=ShiftOut)
async def update_shift(
    shift_id: int,
    data: ShiftUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin", "hr"))
):
    result = await db.execute(select(Shift).where(Shift.id == shift_id))
    shift = result.scalar_one_or_none()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    if data.clear_sat_override:
        shift.sat_start_time = None
        shift.sat_end_time = None
        shift.sat_work_hours = None

    update_fields = data.model_dump(exclude={"clear_sat_override"}, exclude_none=True)
    for key, value in update_fields.items():
        setattr(shift, key, value)

    await db.flush()
    await db.commit()
    await db.refresh(shift)
    return shift

@shift_router.delete("/{shift_id}")
async def delete_shift(
    shift_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin"))
):
    result = await db.execute(select(Shift).where(Shift.id == shift_id))
    shift = result.scalar_one_or_none()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    await db.delete(shift)
    await db.commit()
    return {"message": "Shift deleted"}


# ── Leave Type Management ──────────────────────────────────────
from pydantic import BaseModel as PydanticBase

class LeaveTypeCreate(PydanticBase):
    name: str
    days_per_year: int = 12
    is_paid: bool = True

@leave_router.post("/types", response_model=LeaveTypeOut)
async def create_leave_type(
    data: LeaveTypeCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin", "hr"))
):
    lt = LeaveType(name=data.name, days_per_year=data.days_per_year, is_paid=data.is_paid)
    db.add(lt)
    await db.flush()
    await db.commit()
    await db.refresh(lt)
    return lt

@leave_router.patch("/types/{type_id}")
async def update_leave_type(
    type_id: int,
    data: LeaveTypeCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin", "hr"))
):
    result = await db.execute(select(LeaveType).where(LeaveType.id == type_id))
    lt = result.scalar_one_or_none()
    if not lt:
        raise HTTPException(status_code=404, detail="Leave type not found")
    lt.name = data.name
    lt.days_per_year = data.days_per_year
    lt.is_paid = data.is_paid
    await db.flush()
    await db.commit()
    return {"success": True}

@leave_router.delete("/types/{type_id}")
async def delete_leave_type(
    type_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin", "hr"))
):
    result = await db.execute(select(LeaveType).where(LeaveType.id == type_id))
    lt = result.scalar_one_or_none()
    if not lt:
        raise HTTPException(status_code=404, detail="Leave type not found")
    await db.delete(lt)
    await db.commit()
    return {"success": True}
