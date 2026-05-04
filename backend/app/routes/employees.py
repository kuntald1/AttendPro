from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List
from app.core.database import get_db
from app.core.security import get_current_user, hash_password, require_roles
from app.models.user import Employee, User, Department, Shift
from app.schemas.schemas import EmployeeCreate, EmployeeUpdate, EmployeeOut

router = APIRouter(prefix="/api/employees", tags=["employees"])

async def get_employee_with_relations(db: AsyncSession, emp_id: int):
    result = await db.execute(
        select(Employee)
        .options(
            selectinload(Employee.department),
            selectinload(Employee.shift)
        )
        .where(Employee.id == emp_id)
    )
    return result.scalar_one_or_none()

@router.get("/", response_model=List[EmployeeOut])
async def list_employees(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(
        select(Employee)
        .options(
            selectinload(Employee.department),
            selectinload(Employee.shift)
        )
        .order_by(Employee.full_name)
    )
    return result.scalars().all()

@router.post("/", response_model=EmployeeOut)
async def create_employee(
    data: EmployeeCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin", "hr"))
):
    existing = await db.execute(select(Employee).where(Employee.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    existing_code = await db.execute(select(Employee).where(Employee.employee_code == data.employee_code))
    if existing_code.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Employee code already exists")

    user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        role="employee"
    )
    db.add(user)
    await db.flush()

    emp = Employee(
        user_id=user.id,
        employee_code=data.employee_code,
        full_name=data.full_name,
        email=data.email,
        phone=data.phone,
        designation=data.designation,
        department_id=data.department_id,
        shift_id=data.shift_id,
        joining_date=data.joining_date,
        pan_number=data.pan_number,
        bank_account=data.bank_account,
        bank_name=data.bank_name,
        ifsc_code=data.ifsc_code,
    )
    db.add(emp)
    await db.flush()
    await db.commit()

    emp = await get_employee_with_relations(db, emp.id)
    return emp

@router.get("/{emp_id}", response_model=EmployeeOut)
async def get_employee(
    emp_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user)
):
    emp = await get_employee_with_relations(db, emp_id)
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    return emp

@router.patch("/{emp_id}", response_model=EmployeeOut)
async def update_employee(
    emp_id: int,
    data: EmployeeUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin", "hr"))
):
    result = await db.execute(select(Employee).where(Employee.id == emp_id))
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(emp, field, value)
    await db.flush()
    await db.commit()

    emp = await get_employee_with_relations(db, emp_id)
    return emp

@router.delete("/{emp_id}")
async def delete_employee(
    emp_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin"))
):
    result = await db.execute(select(Employee).where(Employee.id == emp_id))
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    emp.is_active = False
    await db.flush()
    await db.commit()
    return {"message": "Employee deactivated"}


@router.patch("/{emp_id}/exempt-early-leave")
async def toggle_exempt_early_leave(
    emp_id: int,
    payload: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin", "hr"))
):
    result = await db.execute(select(Employee).where(Employee.id == emp_id))
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    emp.exempt_early_leave = payload.get("exempt", False)
    await db.flush()
    await db.commit()
    return {"success": True, "exempt_early_leave": emp.exempt_early_leave}
