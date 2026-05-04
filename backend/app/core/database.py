from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

async def init_db():
    from app.models.user import User, Employee, Department, Shift, AttendanceLog, LeaveType, LeaveRequest, ScanLog
    from app.models.settings import CompanySettings, KioskDevice, Office, EmployeeOffice, Holiday
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
