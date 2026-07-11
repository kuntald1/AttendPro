from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import date, time, datetime
from enum import Enum

class RoleEnum(str, Enum):
    admin = "admin"
    hr = "hr"
    manager = "manager"
    employee = "employee"

class StatusEnum(str, Enum):
    present = "present"
    absent = "absent"
    late = "late"
    half_day = "half_day"
    on_leave = "on_leave"

class LeaveStatusEnum(str, Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"

# ── Auth ───────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    employee_id: Optional[int] = None

# ── Department ─────────────────────────────────────────────────
class DepartmentCreate(BaseModel):
    name: str
    description: Optional[str] = None

class DepartmentOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    model_config = {"from_attributes": True}

# ── Shift ──────────────────────────────────────────────────────
class ShiftCreate(BaseModel):
    name: str
    start_time: time
    end_time: time
    working_days: str = "Mon-Fri"
    grace_minutes: int = 15
    sat_start_time: Optional[time] = None
    sat_end_time: Optional[time] = None
    sat_work_hours: Optional[float] = None

class ShiftUpdate(BaseModel):
    name: Optional[str] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    working_days: Optional[str] = None
    grace_minutes: Optional[int] = None
    sat_start_time: Optional[time] = None
    sat_end_time: Optional[time] = None
    sat_work_hours: Optional[float] = None
    clear_sat_override: bool = False  # explicit flag to remove a Saturday override

class ShiftOut(BaseModel):
    id: int
    name: str
    start_time: time
    end_time: time
    working_days: str
    grace_minutes: int
    sat_start_time: Optional[time] = None
    sat_end_time: Optional[time] = None
    sat_work_hours: Optional[float] = None
    model_config = {"from_attributes": True}

# ── Employee ───────────────────────────────────────────────────
class EmployeeCreate(BaseModel):
    employee_code: str
    full_name: str
    email: EmailStr
    phone: Optional[str] = None
    designation: Optional[str] = None
    department_id: Optional[int] = None
    shift_id: Optional[int] = None
    joining_date: Optional[date] = None
    password: str
    pan_number: Optional[str] = None
    bank_account: Optional[str] = None
    bank_name: Optional[str] = None
    ifsc_code: Optional[str] = None

class EmployeeUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    designation: Optional[str] = None
    department_id: Optional[int] = None
    shift_id: Optional[int] = None
    is_active: Optional[bool] = None
    pan_number: Optional[str] = None
    bank_account: Optional[str] = None
    bank_name: Optional[str] = None
    ifsc_code: Optional[str] = None

class EmployeeOut(BaseModel):
    id: int
    user_id: Optional[int] = None
    employee_code: str
    full_name: str
    email: str
    phone: Optional[str]
    designation: Optional[str]
    department_id: Optional[int]
    shift_id: Optional[int]
    joining_date: Optional[date]
    is_active: bool
    face_registered: bool
    pan_number: Optional[str] = None
    bank_account: Optional[str] = None
    bank_name: Optional[str] = None
    ifsc_code: Optional[str] = None
    department: Optional[DepartmentOut] = None
    shift: Optional[ShiftOut] = None
    model_config = {"from_attributes": True}

# ── Attendance ─────────────────────────────────────────────────
class AttendanceLogOut(BaseModel):
    id: int
    employee_id: int
    date: date
    check_in_time: Optional[datetime]
    check_out_time: Optional[datetime]
    status: str
    method: str
    remarks: Optional[str]
    employee: Optional[EmployeeOut] = None
    model_config = {"from_attributes": True}

class ManualAttendanceCreate(BaseModel):
    employee_id: int
    date: date
    status: StatusEnum
    check_in_time: Optional[datetime] = None
    check_out_time: Optional[datetime] = None
    remarks: Optional[str] = None

# ── Leave ──────────────────────────────────────────────────────
class LeaveTypeOut(BaseModel):
    id: int
    name: str
    days_per_year: int
    is_paid: bool
    model_config = {"from_attributes": True}

class LeaveRequestCreate(BaseModel):
    leave_type_id: int
    from_date: date
    to_date: date
    reason: Optional[str] = None

class LeaveRequestOut(BaseModel):
    id: int
    employee_id: int
    leave_type_id: int
    from_date: date
    to_date: date
    reason: Optional[str]
    status: str
    applied_at: datetime
    employee: Optional[EmployeeOut] = None
    leave_type: Optional[LeaveTypeOut] = None
    model_config = {"from_attributes": True}

class LeaveReviewRequest(BaseModel):
    status: LeaveStatusEnum
    remarks: Optional[str] = None

# ── Dashboard ──────────────────────────────────────────────────
class DashboardStats(BaseModel):
    total_employees: int
    present_today: int
    absent_today: int
    late_today: int
    on_leave_today: int
    attendance_percentage: float
