from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.security import verify_password, create_access_token, get_current_user
from app.models.user import User, Employee
from app.schemas.schemas import LoginRequest, TokenResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User)
        .options(selectinload(User.employee))
        .where(User.email == data.email)
    )
    user = result.scalar_one_or_none()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")

    token = create_access_token({"sub": str(user.id), "role": user.role})
    employee_id = user.employee.id if user.employee else None
    return TokenResponse(access_token=token, role=user.role, employee_id=employee_id)

@router.get("/me")
async def me(current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User)
        .options(selectinload(User.employee))
        .where(User.id == current_user.id)
    )
    user = result.scalar_one_or_none()
    emp = user.employee if user else None
    return {
        "id": user.id,
        "email": user.email,
        "role": user.role,
        "employee_id": emp.id if emp else None,
        "full_name": emp.full_name if emp else None,
        "employee_code": emp.employee_code if emp else None,
    }
