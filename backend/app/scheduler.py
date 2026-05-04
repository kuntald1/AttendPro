"""
Background scheduler for AttendPro.
Uses AsyncIOScheduler + project's AsyncSessionLocal.
"""
import logging
import os
from datetime import date, datetime
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()


async def job_absent_alerts():
    logger.info("Scheduler: running absent alerts")
    try:
        from app.core.database import AsyncSessionLocal
        from app.models.user import User, AttendanceLog
        from app.services.email_service import email_service
        from sqlalchemy import select

        async with AsyncSessionLocal() as db:
            today = date.today()
            emp_result = await db.execute(select(User).where(User.is_active == True))
            employees = [u for u in emp_result.scalars().all() if getattr(u, "role", "") != "admin"]

            logs_result = await db.execute(
                select(AttendanceLog).where(
                    AttendanceLog.check_in >= datetime.combine(today, datetime.min.time())
                )
            )
            present_ids = {l.user_id for l in logs_result.scalars().all()}

            for emp in employees:
                if emp.id not in present_ids:
                    email_service.send_absent_alert(
                        employee_name=getattr(emp, "full_name", emp.email),
                        employee_id=emp.id,
                        employee_email=emp.email,
                        absent_date=today,
                    )
                    logger.info(f"Absent alert → {emp.email}")
    except Exception as e:
        logger.error(f"Absent alerts job error: {e}")


async def job_daily_summary():
    logger.info("Scheduler: running daily summary")
    try:
        from app.core.database import AsyncSessionLocal
        from app.models.user import User, AttendanceLog
        from app.services.email_service import email_service
        from sqlalchemy import select

        async with AsyncSessionLocal() as db:
            today = date.today()
            emp_result = await db.execute(select(User).where(User.is_active == True))
            employees = [u for u in emp_result.scalars().all() if getattr(u, "role", "") != "admin"]

            logs_result = await db.execute(
                select(AttendanceLog).where(
                    AttendanceLog.check_in >= datetime.combine(today, datetime.min.time())
                )
            )
            present_ids = {l.user_id for l in logs_result.scalars().all()}
            present = len(present_ids)
            absent  = len(employees) - present

            summary = {
                "total": len(employees), "present": present,
                "absent": absent, "on_leave": 0, "late": 0,
                "absent_employees": [
                    {"name": getattr(u, "full_name", u.email), "department": None, "last_seen": None}
                    for u in employees if u.id not in present_ids
                ],
                "late_employees": [],
            }
            admin_email = os.getenv("ADMIN_EMAIL", "admin@company.com")
            email_service.send_daily_summary(admin_email, summary, today)
            logger.info("Daily summary sent")
    except Exception as e:
        logger.error(f"Daily summary job error: {e}")


async def job_monthly_payslips():
    logger.info("Scheduler: running monthly payslip generation")
    try:
        from app.core.database import AsyncSessionLocal
        from app.models.user import User
        from app.models.payroll import Payslip
        from app.routes.payroll import _generate_one, _get_working_days
        from sqlalchemy import select

        today = date.today()
        pay_month = 12 if today.month == 1 else today.month - 1
        pay_year  = today.year - 1 if today.month == 1 else today.year
        working_days = _get_working_days(pay_year, pay_month)

        async with AsyncSessionLocal() as db:
            emp_result = await db.execute(select(User).where(User.is_active == True))
            employees = [u for u in emp_result.scalars().all() if getattr(u, "role", "") != "admin"]

            generated = 0
            for emp in employees:
                existing = await db.execute(
                    select(Payslip).where(
                        Payslip.employee_id == emp.id,
                        Payslip.pay_month == pay_month,
                        Payslip.pay_year == pay_year,
                    )
                )
                if existing.scalar_one_or_none():
                    continue
                try:
                    await _generate_one(db, emp, pay_year, pay_month, working_days, working_days)
                    generated += 1
                except Exception as e:
                    logger.warning(f"Payslip failed for {emp.email}: {e}")

            await db.commit()
            logger.info(f"Monthly payslips generated: {generated}")
    except Exception as e:
        logger.error(f"Monthly payslip job error: {e}")


def _get_schedule_config():
    """Get schedule config from DB."""
    try:
        import psycopg2
        conn = psycopg2.connect(host="db", port=5432, database="attendance_db", user="postgres", password="postgres123")
        cur = conn.cursor()
        cur.execute("SELECT absent_alert_time, daily_summary_time, schedule_days FROM company_settings LIMIT 1")
        row = cur.fetchone()
        cur.close()
        conn.close()
        if row:
            absent_time = row[0] or "11:30"
            summary_time = row[1] or "19:00"
            days = row[2] or "mon-sat"
            ah, am = map(int, absent_time.split(":"))
            sh, sm = map(int, summary_time.split(":"))
            return {"absent_hour": ah, "absent_min": am, "summary_hour": sh, "summary_min": sm, "days": days}
    except Exception as e:
        logger.warning(f"Could not read schedule config: {e}")
    return {"absent_hour": 11, "absent_min": 30, "summary_hour": 19, "summary_min": 0, "days": "mon-sat"}


def start_scheduler():
    cfg = _get_schedule_config()
    logger.info(f"Schedule config: absent={cfg['absent_hour']}:{cfg['absent_min']:02d}, summary={cfg['summary_hour']}:{cfg['summary_min']:02d}, days={cfg['days']}")

    scheduler.add_job(job_absent_alerts,    CronTrigger(day_of_week=cfg["days"], hour=cfg["absent_hour"], minute=cfg["absent_min"]),
                      id="absent_alerts",    replace_existing=True)
    scheduler.add_job(job_daily_summary,    CronTrigger(day_of_week=cfg["days"], hour=cfg["summary_hour"], minute=cfg["summary_min"]),
                      id="daily_summary",    replace_existing=True)
    scheduler.add_job(job_monthly_payslips, CronTrigger(day=1, hour=8, minute=0),
                      id="monthly_payslips", replace_existing=True)
    scheduler.start()
    logger.info("Scheduler started ✓")
