"""Pydantic schemas for Payroll module."""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date, datetime
from enum import Enum


class PayComponent(str, Enum):
    BASIC = "basic"
    HRA = "hra"
    TRANSPORT = "transport"
    MEDICAL = "medical"
    SPECIAL_ALLOWANCE = "special_allowance"
    PF = "pf"
    ESI = "esi"
    PROFESSIONAL_TAX = "professional_tax"
    TDS = "tds"
    LOAN = "loan"
    OTHER_EARNING = "other_earning"
    OTHER_DEDUCTION = "other_deduction"


class ComponentType(str, Enum):
    EARNING = "earning"
    DEDUCTION = "deduction"


class PayslipStatus(str, Enum):
    DRAFT = "draft"
    GENERATED = "generated"
    PAID = "paid"


# ── Salary Structure ──────────────────────────────────────────────────────────

class SalaryComponentCreate(BaseModel):
    component: PayComponent
    component_type: ComponentType
    amount: float = Field(..., ge=0)
    is_percentage: bool = False
    percentage_of: Optional[str] = None

    class Config:
        use_enum_values = True


class SalaryComponentOut(SalaryComponentCreate):
    id: int
    structure_id: int

    class Config:
        from_attributes = True


class SalaryStructureCreate(BaseModel):
    employee_id: int
    effective_from: date
    effective_to: Optional[date] = None
    currency: str = "INR"
    notes: Optional[str] = None
    components: List[SalaryComponentCreate]


class SalaryStructureUpdate(BaseModel):
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    notes: Optional[str] = None
    components: Optional[List[SalaryComponentCreate]] = None


class SalaryStructureOut(BaseModel):
    id: int
    employee_id: int
    effective_from: date
    effective_to: Optional[date]
    currency: str
    notes: Optional[str]
    is_active: bool
    created_at: datetime
    components: List[SalaryComponentOut]
    # Computed totals
    gross_salary: float
    total_deductions: float
    net_salary: float

    class Config:
        from_attributes = True


# ── Payslip ───────────────────────────────────────────────────────────────────

class PayslipGenerate(BaseModel):
    employee_id: int
    pay_month: int = Field(..., ge=1, le=12)
    pay_year: int = Field(..., ge=2020)
    working_days: int = Field(..., ge=1)
    present_days: int
    paid_leaves: int = 0
    remarks: Optional[str] = None


class BulkPayslipGenerate(BaseModel):
    pay_month: int = Field(..., ge=1, le=12)
    pay_year: int = Field(..., ge=2020)
    employee_ids: Optional[List[int]] = None   # None = all employees


class PayslipItemOut(BaseModel):
    id: int
    component: str
    component_type: str
    label: str
    amount: float

    class Config:
        from_attributes = True


class PayslipOut(BaseModel):
    id: int
    employee_id: int
    employee_name: Optional[str] = None
    employee_email: Optional[str] = None
    department: Optional[str] = None
    pay_month: int
    pay_year: int
    working_days: int
    present_days: int
    paid_leaves: int
    loss_of_pay_days: int
    gross_earnings: float
    total_deductions: float
    net_pay: float
    status: str
    payment_date: Optional[date]
    remarks: Optional[str]
    pdf_path: Optional[str]
    generated_at: Optional[datetime]
    created_at: datetime
    items: List[PayslipItemOut]

    class Config:
        from_attributes = True


class PayslipStatusUpdate(BaseModel):
    status: PayslipStatus
    payment_date: Optional[date] = None


# ── Email Notification ────────────────────────────────────────────────────────

class EmailConfig(BaseModel):
    smtp_host: str
    smtp_port: int = 587
    smtp_user: str
    smtp_password: str
    from_email: str
    from_name: str = "AttendPro System"
    use_tls: bool = True


class NotificationTest(BaseModel):
    to_email: str
    notification_type: str = "test"
