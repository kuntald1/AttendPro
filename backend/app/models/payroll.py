"""
Payroll models for AttendPro.
Tables: salary_structures, salary_components, payslips, payslip_items
"""
from sqlalchemy import Column, Integer, String, Float, Date, DateTime, ForeignKey, Text, Boolean, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class SalaryStructure(Base):
    __tablename__ = "salary_structures"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True)
    effective_from = Column(Date, nullable=False)
    effective_to = Column(Date, nullable=True)
    currency = Column(String(3), default="INR")
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    components = relationship("SalaryComponent", back_populates="structure",
                              cascade="all, delete-orphan")
    payslips = relationship("Payslip", back_populates="salary_structure")


class SalaryComponent(Base):
    __tablename__ = "salary_components"

    id = Column(Integer, primary_key=True, index=True)
    structure_id = Column(Integer, ForeignKey("salary_structures.id"), nullable=False)
    component = Column(Enum('BASIC','HRA','TRANSPORT','MEDICAL','SPECIAL_ALLOWANCE','PF','ESI','PROFESSIONAL_TAX','TDS','LOAN','OTHER_EARNING','OTHER_DEDUCTION','OVERTIME', name='paycomponent', create_type=False), nullable=False)
    component_type = Column(Enum('EARNING','DEDUCTION', name='componenttype', create_type=False), nullable=False)
    amount = Column(Float, nullable=False, default=0.0)
    is_percentage = Column(Boolean, default=False)
    percentage_of = Column(String(50), nullable=True)

    structure = relationship("SalaryStructure", back_populates="components")


class Payslip(Base):
    __tablename__ = "payslips"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    salary_structure_id = Column(Integer, ForeignKey("salary_structures.id"), nullable=False)
    pay_month = Column(Integer, nullable=False)
    pay_year = Column(Integer, nullable=False)
    working_days = Column(Integer, nullable=False)
    present_days = Column(Integer, nullable=False)
    paid_leaves = Column(Integer, default=0)
    loss_of_pay_days = Column(Integer, default=0)
    gross_earnings = Column(Float, nullable=False)
    total_deductions = Column(Float, nullable=False)
    net_pay = Column(Float, nullable=False)
    status = Column(Enum('DRAFT', 'GENERATED', 'PAID', name='payslipstatus', create_type=False), default='draft')
    payment_date = Column(Date, nullable=True)
    remarks = Column(Text, nullable=True)
    pdf_path = Column(String(500), nullable=True)
    generated_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    salary_structure = relationship("SalaryStructure", back_populates="payslips")
    items = relationship("PayslipItem", back_populates="payslip",
                         cascade="all, delete-orphan")


class PayslipItem(Base):
    __tablename__ = "payslip_items"

    id = Column(Integer, primary_key=True, index=True)
    payslip_id = Column(Integer, ForeignKey("payslips.id"), nullable=False)
    component = Column(Enum('BASIC','HRA','TRANSPORT','MEDICAL','SPECIAL_ALLOWANCE','PF','ESI','PROFESSIONAL_TAX','TDS','LOAN','OTHER_EARNING','OTHER_DEDUCTION','OVERTIME', name='paycomponent', create_type=False), nullable=False)
    component_type = Column(Enum('EARNING','DEDUCTION', name='componenttype', create_type=False), nullable=False)
    label = Column(String(100), nullable=False)
    amount = Column(Float, nullable=False)

    payslip = relationship("Payslip", back_populates="items")
