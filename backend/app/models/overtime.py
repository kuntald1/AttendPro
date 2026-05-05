from sqlalchemy import Column, Integer, Float, String, Boolean, Date, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class OvertimeLog(Base):
    __tablename__ = "overtime_logs"
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    date = Column(Date, nullable=False)
    shift_end_time = Column(DateTime(timezone=True), nullable=True)
    actual_checkout = Column(DateTime(timezone=True), nullable=True)
    ot_minutes = Column(Integer, default=0)
    ot_hours = Column(Float, default=0)
    ot_rate = Column(Float, default=1.5)
    ot_amount = Column(Float, default=0)
    status = Column(String(20), default="pending")  # pending, approved, rejected
    approved_by = Column(Integer, ForeignKey("employees.id"), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    remarks = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    employee = relationship("Employee", foreign_keys=[employee_id], backref="overtime_logs")
    approver = relationship("Employee", foreign_keys=[approved_by])
