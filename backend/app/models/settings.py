from sqlalchemy import Column, Integer, String, Boolean, Float, ForeignKey, Date
from sqlalchemy.orm import relationship
from app.core.database import Base


class CompanySettings(Base):
    __tablename__ = "company_settings"
    id = Column(Integer, primary_key=True, index=True)
    company_name = Column(String(200), default="My Company")
    company_email = Column(String(200), nullable=True)
    timezone = Column(String(50), default="Asia/Kolkata")
    geofencing_enabled = Column(Boolean, default=False)
    office_lat = Column(Float, nullable=True)
    office_lng = Column(Float, nullable=True)
    radius_meters = Column(Integer, default=50)
    office_address = Column(String(500), nullable=True)
    work_hours = Column(Float, default=8.0)
    lunch_minutes = Column(Integer, default=30)
    early_leave_enabled = Column(Boolean, default=True)
    early_leave_allowed_per_month = Column(Integer, default=3)
    early_leave_penalty_type = Column(String(20), default="attendance")
    early_leave_penalty_amount = Column(Float, default=1.0)
    working_days_per_week = Column(Integer, default=5)
    # SMTP Email Settings
    smtp_host = Column(String(200), nullable=True)
    smtp_port = Column(Integer, default=587)
    smtp_user = Column(String(200), nullable=True)
    smtp_password = Column(String(500), nullable=True)
    smtp_from_name = Column(String(200), default="AttendPro System")
    admin_email = Column(String(200), nullable=True)
    # Schedule settings
    absent_alert_time = Column(String(5), default="11:30")   # HH:MM
    daily_summary_time = Column(String(5), default="19:00")  # HH:MM
    schedule_days = Column(String(20), default="mon-sat")    # mon-fri or mon-sat


class Office(Base):
    __tablename__ = "offices"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    address = Column(String(500), nullable=True)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    radius_meters = Column(Integer, default=50)
    is_active = Column(Boolean, default=True)
    geofencing_enabled = Column(Boolean, default=False)
    kiosk_devices = relationship("KioskDevice", back_populates="office")
    employees = relationship("EmployeeOffice", back_populates="office")


class KioskDevice(Base):
    __tablename__ = "kiosk_devices"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    ip = Column(String(50), nullable=False)
    is_active = Column(Boolean, default=True)
    office_id = Column(Integer, ForeignKey("offices.id"), nullable=True)
    office = relationship("Office", back_populates="kiosk_devices")


class EmployeeOffice(Base):
    __tablename__ = "employee_offices"
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    office_id = Column(Integer, ForeignKey("offices.id"), nullable=False)
    kiosk_access = Column(Boolean, default=False)
    employee = relationship("Employee")
    office = relationship("Office", back_populates="employees")


class Holiday(Base):
    __tablename__ = "holidays"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    date = Column(Date, nullable=False)
    holiday_type = Column(String(50), default="national")
    is_active = Column(Boolean, default=True)
