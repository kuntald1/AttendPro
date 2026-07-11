from sqlalchemy import Column, Integer, String, Boolean, DateTime, Date, Time, ForeignKey, Text, Enum, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from pgvector.sqlalchemy import Vector
from app.core.database import Base
import enum

class RoleEnum(str, enum.Enum):
    admin = "admin"
    hr = "hr"
    manager = "manager"
    employee = "employee"

class StatusEnum(str, enum.Enum):
    present = "present"
    absent = "absent"
    late = "late"
    half_day = "half_day"
    on_leave = "on_leave"

class LeaveStatusEnum(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"

class MarkMethodEnum(str, enum.Enum):
    face = "face"
    manual = "manual"
    qr = "qr"

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(Enum(RoleEnum), default=RoleEnum.employee)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    employee = relationship("Employee", back_populates="user", uselist=False)

class Department(Base):
    __tablename__ = "departments"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    manager_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    employees = relationship("Employee", back_populates="department", foreign_keys="Employee.department_id")

class Shift(Base):
    __tablename__ = "shifts"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    working_days = Column(String(20), default="Mon-Fri")
    grace_minutes = Column(Integer, default=15)
    # Optional Saturday-specific override. When set, Saturday check-ins/
    # early-leave use these instead of the regular start/end/work hours.
    sat_start_time = Column(Time, nullable=True)
    sat_end_time = Column(Time, nullable=True)
    sat_work_hours = Column(Float, nullable=True)
    employees = relationship("Employee", back_populates="shift")

class Employee(Base):
    __tablename__ = "employees"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=True)
    employee_code = Column(String(20), unique=True, nullable=False)
    full_name = Column(String(150), nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    phone = Column(String(20), nullable=True)
    designation = Column(String(100), nullable=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    shift_id = Column(Integer, ForeignKey("shifts.id"), nullable=True)
    joining_date = Column(Date, nullable=True)
    is_active = Column(Boolean, default=True)
    face_embedding = Column(Vector(4096), nullable=True)
    face_registered = Column(Boolean, default=False)
    exempt_early_leave = Column(Boolean, default=False)
    pan_number = Column(String(20), nullable=True)
    bank_account = Column(String(50), nullable=True)
    bank_name = Column(String(100), nullable=True)
    ifsc_code = Column(String(20), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    user = relationship("User", back_populates="employee")
    department = relationship("Department", back_populates="employees", foreign_keys=[department_id])
    shift = relationship("Shift", back_populates="employees")
    attendance_logs = relationship("AttendanceLog", back_populates="employee")
    leave_requests = relationship("LeaveRequest", back_populates="employee", foreign_keys="[LeaveRequest.employee_id]")

class AttendanceLog(Base):
    __tablename__ = "attendance_logs"
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    date = Column(Date, nullable=False)
    check_in_time = Column(DateTime(timezone=True), nullable=True)
    check_out_time = Column(DateTime(timezone=True), nullable=True)
    status = Column(Enum(StatusEnum), default=StatusEnum.absent)
    method = Column(Enum(MarkMethodEnum), default=MarkMethodEnum.manual)
    remarks = Column(Text, nullable=True)
    early_leave = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    employee = relationship("Employee", back_populates="attendance_logs")

class LeaveType(Base):
    __tablename__ = "leave_types"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False)
    days_per_year = Column(Integer, default=12)
    is_paid = Column(Boolean, default=True)
    leave_requests = relationship("LeaveRequest", back_populates="leave_type")

class LeaveRequest(Base):
    __tablename__ = "leave_requests"
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    leave_type_id = Column(Integer, ForeignKey("leave_types.id"), nullable=False)
    from_date = Column(Date, nullable=False)
    to_date = Column(Date, nullable=False)
    reason = Column(Text, nullable=True)
    status = Column(Enum(LeaveStatusEnum), default=LeaveStatusEnum.pending)
    approved_by = Column(Integer, ForeignKey("employees.id"), nullable=True)
    applied_at = Column(DateTime(timezone=True), server_default=func.now())
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    employee = relationship("Employee", back_populates="leave_requests", foreign_keys="[LeaveRequest.employee_id]")
    approver = relationship("Employee", foreign_keys="[LeaveRequest.approved_by]")
    leave_type = relationship("LeaveType", back_populates="leave_requests")


class ScanLog(Base):
    __tablename__ = "scan_logs"
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    scan_time = Column(DateTime(timezone=True), nullable=False)
    scan_type = Column(String(20), default="face")  # face, manual
    confidence = Column(Float, nullable=True)
    date = Column(Date, nullable=False)
    employee = relationship("Employee", backref="scan_logs")
