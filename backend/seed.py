"""
Run this ONCE after docker compose up to create the admin user.

Usage:
    docker exec attendance_backend python seed.py
"""
import asyncio
from app.core.database import AsyncSessionLocal, init_db
from app.core.security import hash_password
from app.models.user import User, Employee, Department, Shift, LeaveType
from sqlalchemy import select
from datetime import time

async def seed():
    await init_db()
    async with AsyncSessionLocal() as db:
        # Check if admin already exists
        result = await db.execute(select(User).where(User.email == "admin@company.com"))
        if result.scalar_one_or_none():
            print("Admin already exists. Skipping seed.")
            return

        # Create admin user
        admin = User(
            email="admin@company.com",
            hashed_password=hash_password("admin123"),
            role="admin"
        )
        db.add(admin)
        await db.flush()

        # Create HR user
        hr = User(
            email="hr@company.com",
            hashed_password=hash_password("hr123"),
            role="hr"
        )
        db.add(hr)

        # Create default department
        dept = Department(name="Engineering", description="Software Engineering Team")
        db.add(dept)
        await db.flush()

        # Create default shift
        shift = Shift(
            name="General",
            start_time=time(9, 0),
            end_time=time(18, 0),
            working_days="Mon-Fri",
            grace_minutes=15
        )
        db.add(shift)

        # Create leave types
        for lt in [
            LeaveType(name="Casual Leave", days_per_year=12, is_paid=True),
            LeaveType(name="Sick Leave", days_per_year=12, is_paid=True),
            LeaveType(name="Earned Leave", days_per_year=18, is_paid=True),
            LeaveType(name="Loss of Pay", days_per_year=365, is_paid=False),
        ]:
            db.add(lt)

        await db.commit()
        print("✅ Seed complete!")
        print("   Admin login  → admin@company.com / admin123")
        print("   HR login     → hr@company.com / hr123")

if __name__ == "__main__":
    asyncio.run(seed())
