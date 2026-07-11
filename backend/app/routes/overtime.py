from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, extract
from sqlalchemy.orm import selectinload
from typing import Optional, List
from datetime import datetime, date, timedelta
import logging

from app.core.database import get_db
from app.core.security import get_current_user, require_roles
from app.models.user import Employee, AttendanceLog, Shift
from app.models.settings import CompanySettings
from app.models.overtime import OvertimeLog
from app.core.shift_utils import get_effective_shift_times

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/overtime", tags=["overtime"])


async def _get_ot_settings(db: AsyncSession) -> dict:
    """Get OT settings from company_settings."""
    res = await db.execute(select(CompanySettings).limit(1))
    cs = res.scalar_one_or_none()
    if not cs:
        return {"enabled": False}
    return {
        "enabled": getattr(cs, "ot_enabled", False) or False,
        "weekday_rate": getattr(cs, "ot_weekday_rate", 1.5) or 1.5,
        "weekend_rate": getattr(cs, "ot_weekend_rate", 2.0) or 2.0,
        "basis": getattr(cs, "ot_basis", "basic") or "basic",
        "min_minutes": getattr(cs, "ot_min_minutes", 30) or 30,
        "max_hours": getattr(cs, "ot_max_hours", 4.0) or 4.0,
    }


def _is_weekend(d: date) -> bool:
    return d.weekday() >= 5  # Saturday=5, Sunday=6


@router.get("/settings")
async def get_ot_settings(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    return await _get_ot_settings(db)


@router.post("/calculate")
async def calculate_ot(
    month: int = Query(...),
    year: int = Query(...),
    employee_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin", "hr"))
):
    """Scan attendance logs and calculate OT for all employees for a month."""
    cfg = await _get_ot_settings(db)
    if not cfg["enabled"]:
        raise HTTPException(400, "Overtime is disabled. Enable it in Settings first.")

    # Get employees
    if employee_id:
        emp_res = await db.execute(select(Employee).where(Employee.id == employee_id, Employee.is_active == True))
    else:
        emp_res = await db.execute(select(Employee).where(Employee.is_active == True))
    employees = emp_res.scalars().all()

    created, updated, skipped = 0, 0, 0

    for emp in employees:
        # Get shift
        shift = None
        if emp.shift_id:
            shift_res = await db.execute(select(Shift).where(Shift.id == emp.shift_id))
            shift = shift_res.scalar_one_or_none()

        if not shift:
            skipped += 1
            continue

        # Get attendance logs for this month
        logs_res = await db.execute(
            select(AttendanceLog).where(
                AttendanceLog.employee_id == emp.id,
                extract("month", AttendanceLog.date) == month,
                extract("year", AttendanceLog.date) == year,
                AttendanceLog.check_out_time.isnot(None),
            )
        )
        logs = [l for l in logs_res.scalars().all()
                if str(l.status).lower() in ["present", "late", "statusenum.present", "statusenum.late"]]

        for log in logs:
            if not log.check_out_time:
                continue

            log_date = log.date
            # Calculate shift end datetime for that day (shift times stored as IST, DB as UTC)
            from datetime import timezone, timedelta
            IST = timezone(timedelta(hours=5, minutes=30))
            # Combine date with shift end time in IST, then convert to UTC
            # (uses Saturday-specific end time when the shift has one configured)
            _, eff_end = get_effective_shift_times(shift, log_date)
            shift_end_ist = datetime.combine(log_date, eff_end).replace(tzinfo=IST)
            shift_end_utc = shift_end_ist.astimezone(timezone.utc)

            # How many minutes after shift end did they checkout?
            checkout_utc = log.check_out_time.astimezone(timezone.utc)
            diff_minutes = int((checkout_utc - shift_end_utc).total_seconds() / 60)

            if diff_minutes < cfg["min_minutes"]:
                continue  # Not enough OT

            # Cap at max hours
            ot_minutes = min(diff_minutes, int(cfg["max_hours"] * 60))
            ot_hours = round(ot_minutes / 60, 2)

            # Determine rate
            ot_rate = cfg["weekend_rate"] if _is_weekend(log_date) else cfg["weekday_rate"]

            # Check if already exists
            existing_res = await db.execute(
                select(OvertimeLog).where(
                    OvertimeLog.employee_id == emp.id,
                    OvertimeLog.date == log_date,
                )
            )
            existing = existing_res.scalar_one_or_none()

            if existing and existing.status == "approved":
                skipped += 1
                continue  # Don't touch approved OT

            if existing:
                existing.ot_minutes = ot_minutes
                existing.ot_hours = ot_hours
                existing.ot_rate = ot_rate
                existing.actual_checkout = log.check_out_time
                existing.shift_end_time = shift_end_utc
                updated += 1
            else:
                ot_log = OvertimeLog(
                    employee_id=emp.id,
                    date=log_date,
                    shift_end_time=shift_end_utc,
                    actual_checkout=log.check_out_time,
                    ot_minutes=ot_minutes,
                    ot_hours=ot_hours,
                    ot_rate=ot_rate,
                    ot_amount=0,  # calculated on approval
                    status="pending",
                )
                db.add(ot_log)
                created += 1

    await db.commit()
    return {"created": created, "updated": updated, "skipped": skipped,
            "message": f"OT calculated: {created} new, {updated} updated, {skipped} skipped"}


@router.get("/")
async def list_ot(
    month: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    employee_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """List overtime records."""
    q = select(OvertimeLog).options(
        selectinload(OvertimeLog.employee),
    ).order_by(OvertimeLog.date.desc())

    if month:
        q = q.where(extract("month", OvertimeLog.date) == month)
    if year:
        q = q.where(extract("year", OvertimeLog.date) == year)
    if status:
        q = q.where(OvertimeLog.status == status)

    # Employees see only their own
    if current_user.role == "employee":
        emp_res = await db.execute(select(Employee).where(Employee.user_id == current_user.id))
        emp = emp_res.scalar_one_or_none()
        if emp:
            q = q.where(OvertimeLog.employee_id == emp.id)
    elif employee_id:
        q = q.where(OvertimeLog.employee_id == employee_id)

    res = await db.execute(q)
    logs = res.scalars().all()

    return [
        {
            "id": l.id,
            "employee_id": l.employee_id,
            "employee_name": l.employee.full_name if l.employee else "—",
            "employee_code": l.employee.employee_code if l.employee else "—",
            "date": str(l.date),
            "is_weekend": _is_weekend(l.date),
            "ot_minutes": l.ot_minutes,
            "ot_hours": l.ot_hours,
            "ot_rate": l.ot_rate,
            "ot_amount": l.ot_amount,
            "status": l.status,
            "remarks": l.remarks,
            "reviewed_at": str(l.reviewed_at) if l.reviewed_at else None,
        }
        for l in logs
    ]


@router.patch("/{ot_id}/review")
async def review_ot(
    ot_id: int,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_roles("admin", "hr"))
):
    """Approve or reject an OT record and calculate amount."""
    res = await db.execute(
        select(OvertimeLog).options(selectinload(OvertimeLog.employee))
        .where(OvertimeLog.id == ot_id)
    )
    ot = res.scalar_one_or_none()
    if not ot:
        raise HTTPException(404, "OT record not found")

    new_status = payload.get("status", "approved").lower()
    remarks = payload.get("remarks", "")

    ot.status = new_status
    ot.remarks = remarks
    ot.reviewed_at = datetime.utcnow()

    # Calculate OT amount on approval
    if new_status == "approved" and ot.employee:
        cfg = await _get_ot_settings(db)
        emp = ot.employee

        # Get salary basis
        from app.models.payroll import SalaryStructure, SalaryComponent
        ss_res = await db.execute(
            select(SalaryStructure).options(selectinload(SalaryStructure.components))
            .where(SalaryStructure.employee_id == emp.user_id, SalaryStructure.is_active == True)
        )
        ss = ss_res.scalar_one_or_none()

        basis_amount = 0
        if ss:
            if cfg["basis"] == "basic":
                # Find Basic Salary component
                for comp in ss.components:
                    if comp.component.upper() in ["BASIC", "BASIC_SALARY"]:
                        basis_amount = comp.amount
                        break
                if not basis_amount:
                    basis_amount = sum(c.amount for c in ss.components if c.component_type.upper() == "EARNING")
            else:
                # Gross
                basis_amount = sum(c.amount for c in ss.components if c.component_type.upper() == "EARNING")

        # Get working days for hourly rate
        from app.routes.payroll import _get_working_days
        import calendar
        working_days = _get_working_days(ot.date.year, ot.date.month)
        hours_per_month = working_days * 8

        hourly_rate = basis_amount / hours_per_month if hours_per_month > 0 else 0
        ot.ot_amount = round(ot.ot_hours * hourly_rate * ot.ot_rate, 2)

    # Get approver employee
    approver_res = await db.execute(select(Employee).where(Employee.user_id == current_user.id))
    approver = approver_res.scalar_one_or_none()
    if approver:
        ot.approved_by = approver.id

    await db.commit()
    return {
        "id": ot.id,
        "status": ot.status,
        "ot_amount": ot.ot_amount,
        "remarks": ot.remarks,
    }


@router.get("/summary")
async def ot_summary(
    employee_id: int = Query(...),
    month: int = Query(...),
    year: int = Query(...),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user)
):
    """Get total approved OT hours and amount for an employee in a month."""
    res = await db.execute(
        select(OvertimeLog).where(
            OvertimeLog.employee_id == employee_id,
            OvertimeLog.status == "approved",
            extract("month", OvertimeLog.date) == month,
            extract("year", OvertimeLog.date) == year,
        )
    )
    logs = res.scalars().all()
    total_hours = sum(l.ot_hours for l in logs)
    total_amount = sum(l.ot_amount for l in logs)
    return {
        "employee_id": employee_id,
        "month": month,
        "year": year,
        "total_ot_hours": round(total_hours, 2),
        "total_ot_amount": round(total_amount, 2),
        "approved_count": len(logs),
    }
