"""
Payroll Router – /api/payroll
Uses async SQLAlchemy to match the project's existing database setup.
"""
import os
import asyncio
import calendar
import logging
from datetime import date, datetime
from typing import Optional, List


def _parse_date(val):
    """Convert string date to date object if needed."""
    if val is None:
        return None
    if isinstance(val, date):
        return val
    return date.fromisoformat(str(val))

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, extract, delete
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.user import User, Employee, AttendanceLog, Shift
from app.models.payroll import SalaryStructure, SalaryComponent, Payslip, PayslipItem
from app.services.pdf_service import generate_payslip_pdf
from app.services.email_service import email_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/payroll", tags=["Payroll"])

COMPONENT_LABELS = {
    "basic": "Basic Salary",
    "hra": "House Rent Allowance",
    "transport": "Transport Allowance",
    "medical": "Medical Allowance",
    "special_allowance": "Special Allowance",
    "other_earning": "Other Earning",
    "pf": "Provident Fund (PF)",
    "esi": "ESI",
    "professional_tax": "Professional Tax",
    "tds": "TDS",
    "loan": "Loan Deduction",
    "other_deduction": "Other Deduction",
}

COMPANY_INFO = {
    "company_name": os.getenv("COMPANY_NAME", "Your Company Pvt. Ltd."),
    "company_address": os.getenv("COMPANY_ADDRESS", ""),
}


def _get_working_days(year: int, month: int, working_days_str: str = "Mon-Sat") -> int:
    """Count working days in month based on shift's working_days string."""
    day_map = {"Mon": 0, "Tue": 1, "Wed": 2, "Thu": 3, "Fri": 4, "Sat": 5, "Sun": 6}
    # Parse "Mon-Fri" or "Mon-Sat" style
    parts = working_days_str.replace(" ", "").split("-")
    if len(parts) == 2:
        start = day_map.get(parts[0], 0)
        end   = day_map.get(parts[1], 4)
        allowed = set(range(start, end + 1))
    else:
        allowed = set(range(0, 5))  # Default Mon-Fri

    _, num_days = calendar.monthrange(year, month)
    return sum(1 for d in range(1, num_days + 1) if date(year, month, d).weekday() in allowed)


def _structure_totals(components):
    gross = sum(c.amount for c in components if c.component_type.lower() == "earning")
    deductions = sum(c.amount for c in components if c.component_type.lower() == "deduction")
    return round(gross, 2), round(deductions, 2), round(gross - deductions, 2)


def _structure_out(ss):
    gross, ded, net = _structure_totals(ss.components)
    return {
        "id": ss.id,
        "employee_id": ss.employee_id,
        "effective_from": str(ss.effective_from),
        "effective_to": str(ss.effective_to) if ss.effective_to else None,
        "currency": ss.currency,
        "notes": ss.notes,
        "is_active": ss.is_active,
        "created_at": str(ss.created_at),
        "gross_salary": gross,
        "total_deductions": ded,
        "net_salary": net,
        "components": [
            {
                "id": c.id,
                "structure_id": c.structure_id,
                "component": c.component,
                "component_type": c.component_type.lower(),
                "amount": c.amount,
                "is_percentage": c.is_percentage,
            }
            for c in ss.components
        ],
    }


def _payslip_out(ps, employee=None, items_data=None):
    items = items_data if items_data is not None else []
    return {
        "id": ps.id,
        "employee_id": ps.employee_id,
        "employee_name": getattr(employee, "full_name", None) if employee else None,
        "employee_email": getattr(employee, "email", None) if employee else None,
        "pay_month": ps.pay_month,
        "pay_year": ps.pay_year,
        "working_days": ps.working_days,
        "present_days": ps.present_days,
        "paid_leaves": ps.paid_leaves,
        "loss_of_pay_days": ps.loss_of_pay_days,
        "gross_earnings": ps.gross_earnings,
        "total_deductions": ps.total_deductions,
        "net_pay": ps.net_pay,
        "status": ps.status,
        "payment_date": str(ps.payment_date) if ps.payment_date else None,
        "remarks": ps.remarks,
        "pdf_path": ps.pdf_path,
        "generated_at": str(ps.generated_at) if ps.generated_at else None,
        "created_at": str(ps.created_at),
        "items": [
            {
                "id": i.get("id", 0) if isinstance(i, dict) else i.id,
                "component": i.get("component") if isinstance(i, dict) else i.component,
                "component_type": i.get("component_type") if isinstance(i, dict) else i.component_type,
                "label": i.get("label") if isinstance(i, dict) else i.label,
                "amount": i.get("amount") if isinstance(i, dict) else i.amount,
            }
            for i in items
        ],
    }


# ── Attendance Summary for Payslip ───────────────────────────────────────────

@router.get("/attendance-summary")
async def get_attendance_summary(
    employee_id: int = Query(...),   # this is user_id
    pay_month: int = Query(...),
    pay_year: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Returns working days and present days for a given employee and month."""
    # Get employee record from user_id
    # Try finding employee by user_id first, then by employees.id
    emp_result = await db.execute(
        select(Employee).where(Employee.user_id == employee_id)
    )
    emp = emp_result.scalar_one_or_none()
    if not emp:
        # Fallback: maybe employee_id is employees.id
        emp_result2 = await db.execute(
            select(Employee).where(Employee.id == employee_id)
        )
        emp = emp_result2.scalar_one_or_none()
    if not emp:
        raise HTTPException(404, "Employee not found")

    # Get shift to determine working days pattern
    shift_days = "Mon-Fri"
    if emp.shift_id:
        shift_result = await db.execute(select(Shift).where(Shift.id == emp.shift_id))
        shift = shift_result.scalar_one_or_none()
        if shift:
            shift_days = shift.working_days

    working_days = _get_working_days(pay_year, pay_month, shift_days)

    # Count present days from attendance logs (present + late both count)
    from sqlalchemy import extract, and_
    logs_result = await db.execute(
        select(AttendanceLog).where(
            and_(
                AttendanceLog.employee_id == emp.id,
                extract("month", AttendanceLog.date) == pay_month,
                extract("year", AttendanceLog.date) == pay_year,
                AttendanceLog.status.in_(["present", "late", "half_day"]),
            )
        )
    )
    logs = logs_result.scalars().all()
    present_days = len(logs)

    # Count approved paid leaves
    from app.models.user import LeaveRequest
    leaves_result = await db.execute(
        select(LeaveRequest).where(
            and_(
                LeaveRequest.employee_id == emp.id,
                LeaveRequest.status == "approved",
                extract("month", LeaveRequest.from_date) == pay_month,
                extract("year", LeaveRequest.from_date) == pay_year,
            )
        )
    )
    leaves = leaves_result.scalars().all()
    paid_leaves = sum(
        (min(l.to_date, date(pay_year, pay_month, calendar.monthrange(pay_year, pay_month)[1]))
         - max(l.from_date, date(pay_year, pay_month, 1))).days + 1
        for l in leaves
    )

    return {
        "employee_id": employee_id,
        "emp_table_id": emp.id,
        "full_name": emp.full_name,
        "pay_month": pay_month,
        "pay_year": pay_year,
        "working_days": working_days,
        "present_days": present_days,
        "paid_leaves": max(0, paid_leaves),
        "shift_working_days": shift_days,
    }


# ── Salary Structures ─────────────────────────────────────────────────────────

@router.post("/salary-structures", status_code=201)
async def create_salary_structure(payload: dict, db: AsyncSession = Depends(get_db)):
    # Deactivate existing structure
    result = await db.execute(
        select(SalaryStructure).where(
            SalaryStructure.employee_id == payload["employee_id"],
            SalaryStructure.is_active == True,
        )
    )
    old = result.scalar_one_or_none()
    if old:
        old.is_active = False
        old.effective_to = _parse_date(payload.get("effective_from"))

    ss = SalaryStructure(
        employee_id=int(payload["employee_id"]),
        effective_from=_parse_date(payload["effective_from"]),
        effective_to=_parse_date(payload.get("effective_to")),
        currency=payload.get("currency", "INR"),
        notes=payload.get("notes"),
        is_active=True,
    )
    db.add(ss)
    await db.flush()

    for comp in payload.get("components", []):
        db.add(SalaryComponent(
            structure_id=ss.id,
            component=comp["component"].upper(),
            component_type=comp["component_type"].upper(),
            amount=float(comp.get("amount", 0)),
            is_percentage=comp.get("is_percentage", False),
        ))

    await db.commit()
    await db.refresh(ss)
    return _structure_out(ss)


@router.get("/salary-structures")
async def list_salary_structures(
    employee_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    q = select(SalaryStructure).options(selectinload(SalaryStructure.components))
    if employee_id:
        q = q.where(SalaryStructure.employee_id == employee_id)
    result = await db.execute(q)
    return [_structure_out(ss) for ss in result.scalars().all()]


@router.get("/salary-structures/{structure_id}")
async def get_salary_structure(structure_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SalaryStructure)
        .options(selectinload(SalaryStructure.components))
        .where(SalaryStructure.id == structure_id)
    )
    ss = result.scalar_one_or_none()
    if not ss:
        raise HTTPException(404, "Salary structure not found")
    return _structure_out(ss)


@router.put("/salary-structures/{structure_id}")
async def update_salary_structure(
    structure_id: int, payload: dict, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(SalaryStructure)
        .options(selectinload(SalaryStructure.components))
        .where(SalaryStructure.id == structure_id)
    )
    ss = result.scalar_one_or_none()
    if not ss:
        raise HTTPException(404, "Salary structure not found")

    if "components" in payload:
        await db.execute(delete(SalaryComponent).where(SalaryComponent.structure_id == ss.id))
        await db.flush()
        for comp in payload["components"]:
            db.add(SalaryComponent(
                structure_id=ss.id,
                component=comp["component"].upper(),
                component_type=comp["component_type"].upper(),
                amount=float(comp.get("amount", 0)),
                is_percentage=comp.get("is_percentage", False),
            ))

    for field in ["effective_from", "effective_to", "notes", "currency"]:
        if field in payload:
            val = payload[field]
            if field in ["effective_from", "effective_to"]:
                val = _parse_date(val)
            setattr(ss, field, val)

    await db.commit()
    await db.refresh(ss)
    return _structure_out(ss)


@router.delete("/salary-structures/{structure_id}", status_code=204)
async def delete_salary_structure(structure_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SalaryStructure).where(SalaryStructure.id == structure_id))
    ss = result.scalar_one_or_none()
    if not ss:
        raise HTTPException(404, "Salary structure not found")
    await db.delete(ss)
    await db.commit()


# ── Payslip Generation ────────────────────────────────────────────────────────

async def _generate_one(db, employee, year, month, working_days, present_days,
                         paid_leaves=0, remarks=""):
    result = await db.execute(
        select(SalaryStructure)
        .options(selectinload(SalaryStructure.components))
        .where(SalaryStructure.employee_id == employee.id, SalaryStructure.is_active == True)
    )
    ss = result.scalar_one_or_none()
    if not ss:
        raise HTTPException(400, f"No active salary structure for employee {employee.id}")

    loss_of_pay = max(0, working_days - present_days - paid_leaves)
    pay_factor  = (present_days + paid_leaves) / working_days if working_days else 1

    earnings = deductions = 0.0
    items_data = []
    for comp in ss.components:
        amt = round(comp.amount * pay_factor, 2) if comp.component_type.lower() == "earning" else comp.amount
        if comp.component_type.lower() == "earning":
            earnings += amt
        else:
            deductions += amt
        items_data.append({
            "component": comp.component.upper(),
            "component_type": comp.component_type.upper(),
            "label": COMPONENT_LABELS.get(comp.component.lower(), comp.component),
            "amount": amt,
        })

    # Add approved OT amount as earning
    try:
        from app.models.overtime import OvertimeLog
        from sqlalchemy import extract as sql_extract
        # Get employee record (employees.id, not users.id)
        emp_rec = await db.execute(select(Employee).where(Employee.user_id == employee.id))
        emp_obj = emp_rec.scalar_one_or_none()
        if emp_obj:
            ot_res = await db.execute(
                select(OvertimeLog).where(
                    OvertimeLog.employee_id == emp_obj.id,
                    OvertimeLog.status == "approved",
                    sql_extract("month", OvertimeLog.date) == month,
                    sql_extract("year", OvertimeLog.date) == year,
                )
            )
            ot_logs = ot_res.scalars().all()
            ot_total = round(sum(l.ot_amount for l in ot_logs), 2)
            if ot_total > 0:
                earnings += ot_total
                items_data.append({
                    "component": "OVERTIME",
                    "component_type": "EARNING",
                    "label": f"Overtime Allowance ({sum(l.ot_hours for l in ot_logs):.1f} hrs)",
                    "amount": ot_total,
                })
    except Exception as e:
        logger.warning(f"Could not fetch OT for payslip: {e}")

    ps = Payslip(
        employee_id=employee.id,
        salary_structure_id=ss.id,
        pay_month=month, pay_year=year,
        working_days=working_days, present_days=present_days,
        paid_leaves=paid_leaves, loss_of_pay_days=loss_of_pay,
        gross_earnings=round(earnings, 2),
        total_deductions=round(deductions, 2),
        net_pay=round(earnings - deductions, 2),
        status="DRAFT", remarks=remarks,
    )
    db.add(ps)
    await db.flush()

    for item in items_data:
        db.add(PayslipItem(payslip_id=ps.id, **item))
    await db.flush()

    # Fetch company info dynamically from DB
    from app.models.settings import CompanySettings
    cs_result = await db.execute(select(CompanySettings).limit(1))
    cs = cs_result.scalar_one_or_none()
    company_info = {
        "company_name": cs.company_name if cs else os.getenv("COMPANY_NAME", "Your Company Pvt. Ltd."),
        "company_address": cs.office_address if cs and cs.office_address else os.getenv("COMPANY_ADDRESS", ""),
    }

    # Fetch employee details for PDF
    emp_rec = await db.execute(select(Employee).where(Employee.user_id == employee.id))
    emp_obj = emp_rec.scalar_one_or_none()

    # Get department name
    dept_name = None
    if emp_obj and emp_obj.department_id:
        from app.models.user import Department
        dept_res = await db.execute(select(Department).where(Department.id == emp_obj.department_id))
        dept = dept_res.scalar_one_or_none()
        dept_name = dept.name if dept else None

    # Store pdf_data for generation after commit
    pdf_data = {
        **company_info,
        "id": ps.id,
        "employee_id": (emp_obj.employee_code.replace("EMP", "") if emp_obj and emp_obj.employee_code.startswith("EMP") else emp_obj.employee_code) if emp_obj else str(employee.id),
        "employee_name": emp_obj.full_name if emp_obj else str(employee.id),
        "employee_email": employee.email,
        "department": dept_name,
        "designation": emp_obj.designation if emp_obj else None,
        "joining_date": str(emp_obj.joining_date) if emp_obj and emp_obj.joining_date else None,
        "pan_number": getattr(emp_obj, "pan_number", None),
        "bank_account": getattr(emp_obj, "bank_account", None),
        "bank_name": getattr(emp_obj, "bank_name", None),
        "ifsc": getattr(emp_obj, "ifsc_code", None),
        "pay_month": month, "pay_year": year,
        "working_days": working_days, "present_days": present_days,
        "paid_leaves": paid_leaves, "loss_of_pay_days": loss_of_pay,
        "gross_earnings": ps.gross_earnings,
        "total_deductions": ps.total_deductions,
        "net_pay": ps.net_pay,
        "payment_date": None, "remarks": remarks,
        "items": items_data,
    }
    return ps, items_data, pdf_data


@router.post("/payslips/generate", status_code=201)
async def generate_payslip(payload: dict, db: AsyncSession = Depends(get_db)):
    user_id   = payload["employee_id"]
    pay_month = payload["pay_month"]
    pay_year  = payload["pay_year"]

    emp_result = await db.execute(select(User).where(User.id == user_id))
    employee = emp_result.scalar_one_or_none()
    if not employee:
        # Maybe user_id is actually employees.id — look up via Employee table
        emp_rec = await db.execute(select(Employee).where(Employee.id == user_id))
        emp_obj = emp_rec.scalar_one_or_none()
        if emp_obj and emp_obj.user_id:
            user_id = emp_obj.user_id
            emp_result2 = await db.execute(select(User).where(User.id == user_id))
            employee = emp_result2.scalar_one_or_none()
    if not employee:
        raise HTTPException(404, "Employee not found")

    existing = await db.execute(
        select(Payslip).where(
            Payslip.employee_id == user_id,
            Payslip.pay_month == pay_month,
            Payslip.pay_year == pay_year,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Payslip already exists for this month")

    # Auto-fetch attendance if working_days/present_days not explicitly provided
    working_days = payload.get("working_days")
    present_days = payload.get("present_days")
    paid_leaves  = payload.get("paid_leaves", 0)

    if working_days is None or present_days is None:
        from sqlalchemy import extract, and_
        emp_rec = await db.execute(select(Employee).where(Employee.user_id == user_id))
        emp_obj = emp_rec.scalar_one_or_none()
        if not emp_obj:
            emp_rec2 = await db.execute(select(Employee).where(Employee.id == user_id))
            emp_obj = emp_rec2.scalar_one_or_none()
        if emp_obj:
            shift_days = "Mon-Fri"
            if emp_obj.shift_id:
                shift_res = await db.execute(select(Shift).where(Shift.id == emp_obj.shift_id))
                shift = shift_res.scalar_one_or_none()
                if shift:
                    shift_days = shift.working_days
            working_days = working_days or _get_working_days(pay_year, pay_month, shift_days)
            logs_res = await db.execute(
                select(AttendanceLog).where(
                    and_(
                        AttendanceLog.employee_id == emp_obj.id,
                        extract("month", AttendanceLog.date) == pay_month,
                        extract("year", AttendanceLog.date) == pay_year,
                        AttendanceLog.status.in_(["present", "late", "half_day"]),
                    )
                )
            )
            present_days = present_days or len(logs_res.scalars().all())
        else:
            working_days = working_days or 22
            present_days = present_days or 0

    ps, items_data, pdf_data = await _generate_one(
        db, employee,
        pay_year, pay_month,
        int(working_days), int(present_days),
        int(paid_leaves), payload.get("remarks", "")
    )
    await db.commit()

    # Generate PDF after commit (outside SQLAlchemy transaction)
    try:
        pdf_path = generate_payslip_pdf(pdf_data)
        # Use explicit UPDATE to avoid expired session issue
        from sqlalchemy import update as sql_update
        await db.execute(
            sql_update(Payslip)
            .where(Payslip.id == ps.id)
            .values(pdf_path=pdf_path, status="GENERATED", generated_at=datetime.utcnow())
        )
        await db.commit()
        ps.pdf_path = pdf_path
        ps.status = "GENERATED"
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"PDF generation failed: {e}")

    return _payslip_out(ps, employee, items_data)


@router.post("/payslips/bulk-generate", status_code=201)
async def bulk_generate(payload: dict, db: AsyncSession = Depends(get_db)):
    month = payload["pay_month"]
    year  = payload["pay_year"]
    working_days = _get_working_days(year, month)

    emp_result = await db.execute(select(User).where(User.is_active == True))
    employees = [e for e in emp_result.scalars().all() if getattr(e, "role", "") != "admin"]

    generated, skipped, errors = [], [], []
    pdf_queue = []

    for emp in employees:
        existing = await db.execute(
            select(Payslip).where(
                Payslip.employee_id == emp.id,
                Payslip.pay_month == month,
                Payslip.pay_year == year,
            )
        )
        if existing.scalar_one_or_none():
            skipped.append(emp.id)
            continue
        try:
            # Get employee record to find shift
            from sqlalchemy import extract, and_
            emp_rec = await db.execute(select(Employee).where(Employee.user_id == emp.id))
            emp_obj = emp_rec.scalar_one_or_none()

            # Get shift working days
            shift_days = "Mon-Fri"
            if emp_obj and emp_obj.shift_id:
                shift_res = await db.execute(select(Shift).where(Shift.id == emp_obj.shift_id))
                shift = shift_res.scalar_one_or_none()
                if shift:
                    shift_days = shift.working_days
            emp_working_days = _get_working_days(year, month, shift_days)

            # Get actual present days from attendance
            emp_present_days = 0
            if emp_obj:
                logs_res = await db.execute(
                    select(AttendanceLog).where(
                        and_(
                            AttendanceLog.employee_id == emp_obj.id,
                            extract("month", AttendanceLog.date) == month,
                            extract("year", AttendanceLog.date) == year,
                            AttendanceLog.status.in_(["present", "late", "half_day"]),
                        )
                    )
                )
                emp_present_days = len(logs_res.scalars().all())

            ps, items_data, pdf_data = await _generate_one(
                db, emp, year, month, emp_working_days, emp_present_days
            )
            pdf_queue.append((ps.id, pdf_data))
            generated.append(emp.id)
        except Exception as e:
            errors.append({"employee_id": emp.id, "error": str(e)})

    await db.commit()

    # Generate PDFs after commit
    from sqlalchemy import update as sql_update
    for ps_id, pdf_data in pdf_queue:
        try:
            pdf_path = generate_payslip_pdf(pdf_data)
            await db.execute(
                sql_update(Payslip)
                .where(Payslip.id == ps_id)
                .values(pdf_path=pdf_path, status="GENERATED", generated_at=datetime.utcnow())
            )
        except Exception as e:
            errors.append({"payslip_id": ps_id, "pdf_error": str(e)})
    await db.commit()

    return {"generated": generated, "skipped": skipped, "errors": errors}


@router.get("/payslips")
async def list_payslips(
    employee_id: Optional[int] = Query(None),
    pay_month: Optional[int] = Query(None),
    pay_year: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    q = select(Payslip).options(selectinload(Payslip.items))
    if employee_id: q = q.where(Payslip.employee_id == employee_id)
    if pay_month:   q = q.where(Payslip.pay_month == pay_month)
    if pay_year:    q = q.where(Payslip.pay_year == pay_year)
    if status:      q = q.where(Payslip.status == status)
    q = q.order_by(Payslip.pay_year.desc(), Payslip.pay_month.desc())
    result = await db.execute(q)
    payslips = result.scalars().all()

    # Fetch employees for names from Employee table (not User)
    if payslips:
        user_ids = list({ps.employee_id for ps in payslips})
        emp_result = await db.execute(select(Employee).where(Employee.user_id.in_(user_ids)))
        emp_map = {e.user_id: e for e in emp_result.scalars().all()}
    else:
        emp_map = {}

    result_list = []
    for ps in payslips:
        emp_obj = emp_map.get(ps.employee_id)
        items_data = [{"id": i.id, "component": i.component, "component_type": i.component_type,
                       "label": i.label, "amount": i.amount} for i in ps.items]
        out = _payslip_out(ps, None, items_data)
        if emp_obj:
            out["employee_name"] = emp_obj.full_name
            out["employee_email"] = emp_obj.email
            out["department"] = str(emp_obj.department_id)
        result_list.append(out)
    return result_list


@router.get("/payslips/{payslip_id}")
async def get_payslip(payslip_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Payslip).options(selectinload(Payslip.items)).where(Payslip.id == payslip_id)
    )
    ps = result.scalar_one_or_none()
    if not ps:
        raise HTTPException(404, "Payslip not found")
    emp = await db.get(User, ps.employee_id)
    # Pass items as list of dicts to avoid lazy load issues
    items_data = [{"id": i.id, "component": i.component, "component_type": i.component_type,
                   "label": i.label, "amount": i.amount} for i in ps.items]
    return _payslip_out(ps, emp, items_data)


@router.get("/payslips/{payslip_id}/download")
async def download_payslip(payslip_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Payslip).where(Payslip.id == payslip_id))
    ps = result.scalar_one_or_none()
    if not ps or not ps.pdf_path or not os.path.exists(ps.pdf_path):
        raise HTTPException(404, "Payslip PDF not found")
    return FileResponse(ps.pdf_path, media_type="application/pdf",
                        filename=os.path.basename(ps.pdf_path))


@router.patch("/payslips/{payslip_id}/status")
async def update_status(payslip_id: int, payload: dict, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Payslip).options(selectinload(Payslip.items)).where(Payslip.id == payslip_id)
    )
    ps = result.scalar_one_or_none()
    if not ps:
        raise HTTPException(404, "Payslip not found")
    new_status = payload["status"].upper()
    ps.status = new_status
    if payload.get("payment_date"):
        ps.payment_date = _parse_date(payload["payment_date"])
    else:
        ps.payment_date = date.today()
    await db.commit()

    # Auto-send payslip email when marked as PAID
    if new_status == "PAID":
        try:
            emp_rec = await db.execute(select(Employee).where(Employee.user_id == ps.employee_id))
            emp_obj = emp_rec.scalar_one_or_none()

            # Get department name
            dept_name = None
            if emp_obj and emp_obj.department_id:
                from app.models.user import Department
                dept_res = await db.execute(select(Department).where(Department.id == emp_obj.department_id))
                dept = dept_res.scalar_one_or_none()
                dept_name = dept.name if dept else None

            # Get company info from DB
            from app.models.settings import CompanySettings
            cs_res = await db.execute(select(CompanySettings).limit(1))
            cs = cs_res.scalar_one_or_none()

            if emp_obj:
                # Fetch items for PDF
                items_res = await db.execute(select(PayslipItem).where(PayslipItem.payslip_id == ps.id))
                items = items_res.scalars().all()
                items_data = [{"label": i.label, "amount": i.amount, "component_type": i.component_type} for i in items]

                # Regenerate PDF with payment date
                pdf_data = {
                    "company_name": cs.company_name if cs else "Your Company",
                    "company_address": cs.office_address if cs else "",
                    "id": ps.id,
                    "employee_id": emp_obj.employee_code.lstrip("EMP") if emp_obj.employee_code else str(ps.employee_id),
                    "employee_name": emp_obj.full_name,
                    "employee_email": emp_obj.email,
                    "department": dept_name,
                    "designation": emp_obj.designation,
                    "joining_date": str(emp_obj.joining_date) if emp_obj.joining_date else None,
                    "pan_number": emp_obj.pan_number,
                    "bank_account": emp_obj.bank_account,
                    "bank_name": emp_obj.bank_name,
                    "ifsc": emp_obj.ifsc_code,
                    "pay_month": ps.pay_month, "pay_year": ps.pay_year,
                    "working_days": ps.working_days, "present_days": ps.present_days,
                    "paid_leaves": ps.paid_leaves, "loss_of_pay_days": ps.loss_of_pay_days,
                    "gross_earnings": ps.gross_earnings, "total_deductions": ps.total_deductions,
                    "net_pay": ps.net_pay,
                    "payment_date": str(ps.payment_date),
                    "remarks": ps.remarks or "",
                    "items": items_data,
                }
                new_pdf_path = generate_payslip_pdf(pdf_data)
                from sqlalchemy import update as sql_update
                await db.execute(sql_update(Payslip).where(Payslip.id == ps.id).values(pdf_path=new_pdf_path))
                await db.commit()

                # Send email with new PDF
                email_service.send_payslip(
                    employee_name=emp_obj.full_name,
                    employee_email=emp_obj.email,
                    payslip_data={
                        "pay_month": ps.pay_month, "pay_year": ps.pay_year,
                        "gross_earnings": ps.gross_earnings,
                        "total_deductions": ps.total_deductions,
                        "net_pay": ps.net_pay,
                        "working_days": ps.working_days,
                        "present_days": ps.present_days,
                        "loss_of_pay_days": ps.loss_of_pay_days,
                    },
                    pdf_path=new_pdf_path,
                )
        except Exception as e:
            logger.error(f"Failed to send payslip email on mark paid: {e}")

    return {"id": payslip_id, "status": new_status}


@router.post("/payslips/{payslip_id}/send-email")
async def send_payslip_email(payslip_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Payslip).options(selectinload(Payslip.items)).where(Payslip.id == payslip_id)
    )
    ps = result.scalar_one_or_none()
    if not ps:
        raise HTTPException(404, "Payslip not found")
    # Use Employee table for correct email
    emp_rec = await db.execute(select(Employee).where(Employee.user_id == ps.employee_id))
    emp_obj = emp_rec.scalar_one_or_none()
    if not emp_obj:
        raise HTTPException(404, "Employee not found")
    success = email_service.send_payslip(
        employee_name=emp_obj.full_name,
        employee_email=emp_obj.email,
        payslip_data={
            "pay_month": ps.pay_month, "pay_year": ps.pay_year,
            "gross_earnings": ps.gross_earnings,
            "total_deductions": ps.total_deductions,
            "net_pay": ps.net_pay,
            "working_days": ps.working_days,
            "present_days": ps.present_days,
            "loss_of_pay_days": ps.loss_of_pay_days,
        },
        pdf_path=ps.pdf_path,
    )
    if not success:
        raise HTTPException(500, "Failed to send email — check SMTP settings")
    return {"message": "Payslip emailed successfully"}


@router.delete("/payslips/{payslip_id}", status_code=204)
async def delete_payslip(payslip_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Payslip).where(Payslip.id == payslip_id))
    ps = result.scalar_one_or_none()
    if not ps:
        raise HTTPException(404, "Payslip not found")
    if ps.pdf_path and os.path.exists(ps.pdf_path):
        os.remove(ps.pdf_path)
    await db.delete(ps)
    await db.commit()


# ── Notifications ─────────────────────────────────────────────────────────────

@router.post("/notifications/test")
async def test_notification(payload: dict, db: AsyncSession = Depends(get_db)):
    success = email_service.send_test(payload["to_email"])
    return {"success": success, "to": payload["to_email"]}


@router.post("/notifications/daily-summary")
async def send_daily_summary(db: AsyncSession = Depends(get_db)):
    from app.models.user import AttendanceLog
    today = date.today()
    # Get admin email from DB settings
    from app.models.settings import CompanySettings
    cs_result = await db.execute(select(CompanySettings).limit(1))
    cs = cs_result.scalar_one_or_none()
    admin_email = (cs.admin_email if cs and cs.admin_email else None) or os.getenv("ADMIN_EMAIL", "admin@company.com")

    total_result = await db.execute(select(Employee).where(Employee.is_active == True))
    all_emps = total_result.scalars().all()
    total = len(all_emps)

    logs_result = await db.execute(
        select(AttendanceLog).where(AttendanceLog.check_in_time >= datetime.combine(today, datetime.min.time()))
    )
    logs = logs_result.scalars().all()
    present_emp_ids = {l.employee_id for l in logs}
    present = len(present_emp_ids)
    absent  = total - present

    summary = {
        "total": total, "present": present, "absent": absent,
        "on_leave": 0, "late": 0,
        "absent_employees": [
            {"name": e.full_name, "department": None, "last_seen": None}
            for e in all_emps if e.id not in present_emp_ids
        ],
        "late_employees": [],
    }
    success = email_service.send_daily_summary(admin_email, summary, today)
    return {"success": success}


@router.post("/notifications/absent-alerts")
async def send_absent_alerts(db: AsyncSession = Depends(get_db)):
    today = date.today()

    emp_result = await db.execute(select(Employee).where(Employee.is_active == True))
    all_emps = emp_result.scalars().all()

    logs_result = await db.execute(
        select(AttendanceLog).where(
            AttendanceLog.check_in_time >= datetime.combine(today, datetime.min.time())
        )
    )
    present_emp_ids = {l.employee_id for l in logs_result.scalars().all()}

    results = []
    for emp in all_emps:
        if emp.id not in present_emp_ids:
            sent = email_service.send_absent_alert(
                employee_name=emp.full_name,
                employee_id=emp.id,
                employee_email=emp.email,
                absent_date=today,
            )
            results.append({"employee": emp.full_name, "sent": sent})

    return {"total_sent": sum(1 for r in results if r["sent"]), "details": results}
