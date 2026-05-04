from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.security import get_current_user, require_roles
from app.models.settings import CompanySettings, KioskDevice, Office, EmployeeOffice
from app.models.user import Employee
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter(prefix="/api/settings", tags=["settings"])

TIMEZONES = [
    "Asia/Kolkata", "Asia/Dhaka", "Asia/Colombo", "Asia/Kathmandu",
    "Asia/Karachi", "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo",
    "Asia/Shanghai", "Asia/Seoul", "Europe/London", "Europe/Paris",
    "Europe/Berlin", "America/New_York", "America/Chicago",
    "America/Los_Angeles", "America/Sao_Paulo", "Australia/Sydney",
    "Pacific/Auckland", "UTC"
]

class SettingsUpdate(BaseModel):
    company_name: Optional[str] = None
    company_email: Optional[str] = None
    timezone: Optional[str] = None
    work_hours: Optional[float] = None
    lunch_minutes: Optional[int] = None
    early_leave_enabled: Optional[bool] = None
    early_leave_allowed_per_month: Optional[int] = None
    early_leave_penalty_type: Optional[str] = None
    early_leave_penalty_amount: Optional[float] = None
    working_days_per_week: Optional[int] = None
    company_address: Optional[str] = None
    absent_alert_time: Optional[str] = None
    daily_summary_time: Optional[str] = None
    schedule_days: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from_name: Optional[str] = None
    admin_email: Optional[str] = None

class GeofencingUpdate(BaseModel):
    geofencing_enabled: bool = False

class OfficeCreate(BaseModel):
    name: str
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    radius_meters: int = 50
    geofencing_enabled: bool = False

class OfficeUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    radius_meters: Optional[int] = None
    geofencing_enabled: Optional[bool] = None

class KioskDeviceCreate(BaseModel):
    name: str
    ip: str
    office_id: Optional[int] = None

class EmployeeOfficeUpdate(BaseModel):
    office_id: Optional[int] = None
    kiosk_access: bool = False


@router.get("/timezones")
async def get_timezones():
    return TIMEZONES


@router.get("/")
async def get_settings(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(select(CompanySettings).limit(1))
    settings = result.scalar_one_or_none()
    if not settings:
        return {"company_name": "My Company", "company_email": "", "timezone": "Asia/Kolkata"}
    return {
        "company_name": settings.company_name,
        "company_email": settings.company_email,
        "timezone": settings.timezone,
        "work_hours": settings.work_hours or 8.0,
        "lunch_minutes": settings.lunch_minutes or 30,
        "early_leave_enabled": settings.early_leave_enabled if settings.early_leave_enabled is not None else True,
        "early_leave_allowed_per_month": settings.early_leave_allowed_per_month or 3,
        "early_leave_penalty_type": settings.early_leave_penalty_type or "attendance",
        "early_leave_penalty_amount": settings.early_leave_penalty_amount or 1.0,
        "company_address": settings.office_address or "",
        "absent_alert_time": settings.absent_alert_time or "11:30",
        "daily_summary_time": settings.daily_summary_time or "19:00",
        "schedule_days": settings.schedule_days or "mon-sat",
        "smtp_host": settings.smtp_host or "",
        "smtp_port": settings.smtp_port or 587,
        "smtp_user": settings.smtp_user or "",
        "smtp_password": "●●●●●●●●" if settings.smtp_password else "",
        "smtp_from_name": settings.smtp_from_name or "AttendPro System",
        "admin_email": settings.admin_email or "",
    }


@router.patch("/")
async def update_settings(data: SettingsUpdate, db: AsyncSession = Depends(get_db), _=Depends(require_roles("admin"))):
    result = await db.execute(select(CompanySettings).limit(1))
    settings = result.scalar_one_or_none()
    if not settings:
        settings = CompanySettings()
        db.add(settings)
    if data.company_name is not None: settings.company_name = data.company_name
    if data.company_email is not None: settings.company_email = data.company_email
    if data.timezone is not None: settings.timezone = data.timezone
    if data.work_hours is not None: settings.work_hours = data.work_hours
    if data.lunch_minutes is not None: settings.lunch_minutes = data.lunch_minutes
    if data.early_leave_enabled is not None: settings.early_leave_enabled = data.early_leave_enabled
    if data.early_leave_allowed_per_month is not None: settings.early_leave_allowed_per_month = data.early_leave_allowed_per_month
    if data.early_leave_penalty_type is not None: settings.early_leave_penalty_type = data.early_leave_penalty_type
    if data.early_leave_penalty_amount is not None: settings.early_leave_penalty_amount = data.early_leave_penalty_amount
    if data.working_days_per_week is not None: settings.working_days_per_week = data.working_days_per_week
    if data.company_address is not None: settings.office_address = data.company_address
    if data.absent_alert_time is not None: settings.absent_alert_time = data.absent_alert_time
    if data.daily_summary_time is not None: settings.daily_summary_time = data.daily_summary_time
    if data.schedule_days is not None: settings.schedule_days = data.schedule_days
    if data.smtp_host is not None: settings.smtp_host = data.smtp_host
    if data.smtp_port is not None: settings.smtp_port = data.smtp_port
    if data.smtp_user is not None: settings.smtp_user = data.smtp_user
    if data.smtp_password is not None and data.smtp_password != "●●●●●●●●" and data.smtp_password.strip(): settings.smtp_password = data.smtp_password.replace(" ", "")
    if data.smtp_from_name is not None: settings.smtp_from_name = data.smtp_from_name
    if data.admin_email is not None: settings.admin_email = data.admin_email
    await db.flush()
    await db.commit()
    return {"success": True}


@router.get("/geofencing")
async def get_geofencing(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CompanySettings).limit(1))
    settings = result.scalar_one_or_none()
    return {"geofencing_enabled": settings.geofencing_enabled if settings else False}


@router.patch("/geofencing")
async def update_geofencing(data: GeofencingUpdate, db: AsyncSession = Depends(get_db), _=Depends(require_roles("admin"))):
    result = await db.execute(select(CompanySettings).limit(1))
    settings = result.scalar_one_or_none()
    if not settings:
        settings = CompanySettings()
        db.add(settings)
    settings.geofencing_enabled = data.geofencing_enabled
    await db.flush()
    await db.commit()
    return {"success": True}


# ── Offices ───────────────────────────────────────────────────

@router.get("/offices")
async def get_offices(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(select(Office).where(Office.is_active == True))
    offices = result.scalars().all()
    return [{"id": o.id, "name": o.name, "address": o.address, "lat": o.lat, "lng": o.lng, "radius_meters": o.radius_meters, "geofencing_enabled": o.geofencing_enabled} for o in offices]


@router.post("/offices")
async def create_office(data: OfficeCreate, db: AsyncSession = Depends(get_db), _=Depends(require_roles("admin", "hr"))):
    office = Office(**data.model_dump())
    db.add(office)
    await db.flush()
    await db.commit()
    return {"success": True, "id": office.id, "name": office.name}


@router.patch("/offices/{office_id}")
async def update_office(office_id: int, data: OfficeUpdate, db: AsyncSession = Depends(get_db), _=Depends(require_roles("admin", "hr"))):
    result = await db.execute(select(Office).where(Office.id == office_id))
    office = result.scalar_one_or_none()
    if not office:
        raise HTTPException(status_code=404, detail="Office not found")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(office, k, v)
    await db.flush()
    await db.commit()
    return {"success": True}


@router.delete("/offices/{office_id}")
async def delete_office(office_id: int, db: AsyncSession = Depends(get_db), _=Depends(require_roles("admin"))):
    result = await db.execute(select(Office).where(Office.id == office_id))
    office = result.scalar_one_or_none()
    if not office:
        raise HTTPException(status_code=404, detail="Office not found")
    office.is_active = False
    await db.flush()
    await db.commit()
    return {"success": True}


# ── Kiosk Devices ─────────────────────────────────────────────

@router.get("/my-ip")
async def get_my_ip(request: Request):
    client_ip = request.client.host
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
    return {"ip": client_ip}


@router.get("/kiosk-devices")
async def get_kiosk_devices(db: AsyncSession = Depends(get_db), _=Depends(require_roles("admin"))):
    result = await db.execute(select(KioskDevice).options(selectinload(KioskDevice.office)))
    devices = result.scalars().all()
    return [{"id": d.id, "name": d.name, "ip": d.ip, "office_id": d.office_id, "office_name": d.office.name if d.office else None} for d in devices]


@router.post("/kiosk-devices")
async def add_kiosk_device(data: KioskDeviceCreate, db: AsyncSession = Depends(get_db), _=Depends(require_roles("admin"))):
    device = KioskDevice(name=data.name, ip=data.ip, office_id=data.office_id)
    db.add(device)
    await db.flush()
    await db.commit()
    return {"success": True, "id": device.id}


@router.delete("/kiosk-devices/{device_id}")
async def remove_kiosk_device(device_id: int, db: AsyncSession = Depends(get_db), _=Depends(require_roles("admin"))):
    result = await db.execute(select(KioskDevice).where(KioskDevice.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    await db.delete(device)
    await db.commit()
    return {"success": True}


# ── Employee Office Assignment ─────────────────────────────────

@router.get("/employee-office/{employee_id}")
async def get_employee_office(employee_id: int, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(
        select(EmployeeOffice)
        .options(selectinload(EmployeeOffice.office))
        .where(EmployeeOffice.employee_id == employee_id)
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        return {"office_id": None, "office_name": None, "kiosk_access": False}
    return {
        "office_id": assignment.office_id,
        "office_name": assignment.office.name if assignment.office else None,
        "kiosk_access": assignment.kiosk_access
    }


@router.patch("/employee-office/{employee_id}")
async def update_employee_office(employee_id: int, data: EmployeeOfficeUpdate, db: AsyncSession = Depends(get_db), _=Depends(require_roles("admin", "hr"))):
    result = await db.execute(select(EmployeeOffice).where(EmployeeOffice.employee_id == employee_id))
    assignment = result.scalar_one_or_none()
    if not assignment:
        assignment = EmployeeOffice(employee_id=employee_id, office_id=data.office_id, kiosk_access=data.kiosk_access)
        db.add(assignment)
    else:
        assignment.office_id = data.office_id
        assignment.kiosk_access = data.kiosk_access
    await db.flush()
    await db.commit()
    return {"success": True}


# ── Holiday Routes ─────────────────────────────────────────────

class HolidayCreate(BaseModel):
    name: str
    date: str
    holiday_type: str = "national"

@router.get("/holidays")
async def get_holidays(year: Optional[int] = None, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    from app.models.settings import Holiday
    from datetime import date
    year = year or date.today().year
    result = await db.execute(
        select(Holiday).where(
            Holiday.is_active == True,
            Holiday.date >= date(year, 1, 1),
            Holiday.date <= date(year, 12, 31)
        ).order_by(Holiday.date)
    )
    holidays = result.scalars().all()
    return [{"id": h.id, "name": h.name, "date": str(h.date), "holiday_type": h.holiday_type} for h in holidays]

@router.post("/holidays")
async def create_holiday(data: HolidayCreate, db: AsyncSession = Depends(get_db), _=Depends(require_roles("admin", "hr"))):
    from app.models.settings import Holiday
    from datetime import date as date_type
    holiday = Holiday(
        name=data.name,
        date=date_type.fromisoformat(data.date),
        holiday_type=data.holiday_type
    )
    db.add(holiday)
    await db.flush()
    await db.commit()
    return {"success": True, "id": holiday.id}

@router.delete("/holidays/{holiday_id}")
async def delete_holiday(holiday_id: int, db: AsyncSession = Depends(get_db), _=Depends(require_roles("admin", "hr"))):
    from app.models.settings import Holiday
    result = await db.execute(select(Holiday).where(Holiday.id == holiday_id))
    holiday = result.scalar_one_or_none()
    if not holiday:
        raise HTTPException(status_code=404, detail="Holiday not found")
    holiday.is_active = False
    await db.flush()
    await db.commit()
    return {"success": True}
