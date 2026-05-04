"""
Email Notification Service for AttendPro.
Handles: absent alerts, daily summaries, payslip delivery.
Configure via environment variables or .env file.
"""
import os
import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from datetime import date, datetime, timedelta
from typing import Optional, List
from jinja2 import Environment, BaseLoader

logger = logging.getLogger(__name__)

# ── Config (dynamic from DB, fallback to env) ────────────────────────────────
def _get_smtp_config():
    """Get SMTP config from DB using direct psycopg2 sync connection."""
    try:
        import psycopg2
        conn = psycopg2.connect(
            host="db", port=5432,
            database="attendance_db",
            user="postgres", password="postgres123"
        )
        cur = conn.cursor()
        cur.execute("SELECT smtp_host, smtp_port, smtp_user, smtp_password, smtp_from_name, admin_email, company_name, office_address FROM company_settings LIMIT 1")
        row = cur.fetchone()
        cur.close()
        conn.close()
        if row and row[2]:
            return {
                "host": row[0] or "smtp.gmail.com",
                "port": row[1] or 587,
                "user": row[2],
                "password": row[3] or "",
                "from_name": row[4] or "AttendPro System",
                "admin_email": row[5] or os.getenv("ADMIN_EMAIL", "admin@company.com"),
                "company_name": row[6] or "Your Company",
                "company_address": row[7] or "",
            }
        return None
    except Exception as e:
        logger.warning(f"Could not read SMTP config from DB: {e}")
        return None

SMTP_HOST     = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT     = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER     = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
FROM_EMAIL    = os.getenv("FROM_EMAIL", SMTP_USER)
FROM_NAME     = os.getenv("FROM_NAME", "AttendPro System")
COMPANY_NAME  = os.getenv("COMPANY_NAME", "Your Company Pvt. Ltd.")
ADMIN_EMAIL   = os.getenv("ADMIN_EMAIL", "admin@company.com")
USE_TLS       = os.getenv("SMTP_USE_TLS", "true").lower() == "true"


# ── HTML Email Templates ──────────────────────────────────────────────────────

ABSENT_ALERT_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; background:#f8fafc; margin:0; padding:0; }
  .container { max-width:600px; margin:30px auto; background:#fff; border-radius:12px;
               overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,.08); }
  .header { background:linear-gradient(135deg,#1E40AF,#3B82F6); padding:28px 30px; color:#fff; }
  .header h1 { margin:0; font-size:22px; }
  .header p  { margin:4px 0 0; opacity:.85; font-size:13px; }
  .body { padding:28px 30px; color:#1e293b; }
  .badge { display:inline-block; background:#FEF3C7; color:#92400E; border:1px solid #FCD34D;
           border-radius:6px; padding:4px 12px; font-size:12px; font-weight:600; margin-bottom:16px; }
  .info-box { background:#F0F9FF; border-left:4px solid #3B82F6; border-radius:0 8px 8px 0;
              padding:14px 18px; margin:16px 0; }
  .info-box p { margin:4px 0; font-size:14px; }
  .info-box strong { color:#1E40AF; }
  .footer { background:#F8FAFC; padding:18px 30px; border-top:1px solid #E2E8F0;
            font-size:12px; color:#64748B; text-align:center; }
  .btn { display:inline-block; background:#1E40AF; color:#fff !important; padding:10px 22px;
         border-radius:7px; text-decoration:none; font-size:13px; font-weight:600; margin-top:16px; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>&#128680; Absence Alert</h1>
    <p>{{ company_name }} – AttendPro Notification</p>
  </div>
  <div class="body">
    <div class="badge">ABSENT TODAY</div>
    <p>Dear <strong>{{ employee_name }}</strong>,</p>
    <p>Our records show that you were <strong>absent</strong> today, <strong>{{ date }}</strong>, without any approved leave on record.</p>
    <div class="info-box">
      <p><strong>Employee:</strong> {{ employee_name }}</p>
      <p><strong>Employee ID:</strong> EMP-{{ employee_id }}</p>
      <p><strong>Date:</strong> {{ date }}</p>
      <p><strong>Status:</strong> Absent (No approved leave)</p>
    </div>
    <p>If this is an error or you have a valid reason, please contact your manager or HR immediately.</p>
    <p>Unexplained absences may affect your monthly payroll as <em>Loss of Pay (LOP)</em>.</p>
    <a href="{{ dashboard_url }}" class="btn">View Attendance Dashboard</a>
  </div>
  <div class="footer">
    This is an automated notification from AttendPro. Please do not reply to this email.<br>
    &copy; {{ year }} {{ company_name }}
  </div>
</div>
</body>
</html>
"""

DAILY_SUMMARY_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family:'Segoe UI',Arial,sans-serif; background:#f8fafc; margin:0; padding:0; }
  .container { max-width:680px; margin:30px auto; background:#fff; border-radius:12px;
               overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,.08); }
  .header { background:linear-gradient(135deg,#1E40AF,#3B82F6); padding:28px 30px; color:#fff; }
  .header h1 { margin:0; font-size:22px; }
  .header p  { margin:4px 0 0; opacity:.85; font-size:13px; }
  .body { padding:24px 30px; color:#1e293b; }
  .stats { display:flex; gap:12px; margin:20px 0; flex-wrap:wrap; }
  .stat { flex:1; min-width:100px; background:#F0F9FF; border-radius:10px;
          padding:16px; text-align:center; border:1px solid #BFDBFE; }
  .stat .number { font-size:28px; font-weight:700; color:#1E40AF; }
  .stat .label  { font-size:11px; color:#64748B; margin-top:2px; }
  .stat.red   { background:#FFF1F2; border-color:#FECDD3; }
  .stat.red   .number { color:#DC2626; }
  .stat.green { background:#F0FDF4; border-color:#BBF7D0; }
  .stat.green .number { color:#16A34A; }
  .stat.yellow{ background:#FFFBEB; border-color:#FDE68A; }
  .stat.yellow .number { color:#D97706; }
  table { width:100%; border-collapse:collapse; margin-top:16px; font-size:13px; }
  th { background:#1E40AF; color:#fff; padding:10px 12px; text-align:left; }
  td { padding:9px 12px; border-bottom:1px solid #E2E8F0; }
  tr:nth-child(even) td { background:#F8FAFC; }
  .badge-present  { background:#DCFCE7; color:#166534; border-radius:4px; padding:2px 8px; font-size:11px; }
  .badge-absent   { background:#FEE2E2; color:#991B1B; border-radius:4px; padding:2px 8px; font-size:11px; }
  .badge-leave    { background:#FEF3C7; color:#92400E; border-radius:4px; padding:2px 8px; font-size:11px; }
  .badge-late     { background:#EDE9FE; color:#5B21B6; border-radius:4px; padding:2px 8px; font-size:11px; }
  .footer { background:#F8FAFC; padding:18px 30px; border-top:1px solid #E2E8F0;
            font-size:12px; color:#64748B; text-align:center; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>&#128200; Daily Attendance Summary</h1>
    <p>{{ company_name }} &bull; {{ date }}</p>
  </div>
  <div class="body">
    <p>Here is the attendance overview for <strong>{{ date }}</strong>:</p>
    <div class="stats">
      <div class="stat">
        <div class="number">{{ total }}</div>
        <div class="label">Total Employees</div>
      </div>
      <div class="stat green">
        <div class="number">{{ present }}</div>
        <div class="label">Present</div>
      </div>
      <div class="stat red">
        <div class="number">{{ absent }}</div>
        <div class="label">Absent</div>
      </div>
      <div class="stat yellow">
        <div class="number">{{ on_leave }}</div>
        <div class="label">On Leave</div>
      </div>
      <div class="stat" style="background:#EDE9FE;border-color:#DDD6FE;">
        <div class="number" style="color:#5B21B6;">{{ late }}</div>
        <div class="label">Late Arrivals</div>
      </div>
    </div>

    {% if absent_employees %}
    <h3 style="color:#DC2626;font-size:14px;margin:20px 0 8px;">&#128683; Absent Employees</h3>
    <table>
      <tr><th>Name</th><th>Department</th><th>Last Seen</th></tr>
      {% for emp in absent_employees %}
      <tr>
        <td>{{ emp.name }}</td>
        <td>{{ emp.department or '–' }}</td>
        <td>{{ emp.last_seen or 'N/A' }}</td>
      </tr>
      {% endfor %}
    </table>
    {% endif %}

    {% if late_employees %}
    <h3 style="color:#7C3AED;font-size:14px;margin:20px 0 8px;">&#9200; Late Arrivals</h3>
    <table>
      <tr><th>Name</th><th>Department</th><th>Check-In</th></tr>
      {% for emp in late_employees %}
      <tr>
        <td>{{ emp.name }}</td>
        <td>{{ emp.department or '–' }}</td>
        <td>{{ emp.check_in }}</td>
      </tr>
      {% endfor %}
    </table>
    {% endif %}
  </div>
  <div class="footer">
    Automated daily summary by AttendPro &bull; {{ date }}<br>
    &copy; {{ year }} {{ company_name }}
  </div>
</div>
</body>
</html>
"""

PAYSLIP_DELIVERY_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family:'Segoe UI',Arial,sans-serif; background:#f8fafc; margin:0; padding:0; }
  .container { max-width:600px; margin:30px auto; background:#fff; border-radius:12px;
               overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,.08); }
  .header { background:linear-gradient(135deg,#065F46,#10B981); padding:28px 30px; color:#fff; }
  .header h1 { margin:0; font-size:22px; }
  .header p  { margin:4px 0 0; opacity:.85; font-size:13px; }
  .body { padding:28px 30px; color:#1e293b; }
  .amount-box { background:linear-gradient(135deg,#1E40AF,#3B82F6); color:#fff;
                border-radius:12px; padding:22px; text-align:center; margin:20px 0; }
  .amount-box .label { font-size:13px; opacity:.85; }
  .amount-box .amount { font-size:36px; font-weight:800; margin:6px 0; }
  .info-row { display:flex; justify-content:space-between; padding:8px 0;
              border-bottom:1px solid #E2E8F0; font-size:13px; }
  .info-row .key { color:#64748B; }
  .info-row .val { font-weight:600; }
  .footer { background:#F8FAFC; padding:18px 30px; border-top:1px solid #E2E8F0;
            font-size:12px; color:#64748B; text-align:center; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>&#127873; Your Payslip is Ready</h1>
    <p>{{ company_name }} &bull; {{ month_name }}</p>
  </div>
  <div class="body">
    <p>Dear <strong>{{ employee_name }}</strong>,</p>
    <p>Your payslip for <strong>{{ month_name }}</strong> has been generated. Please find it attached.</p>
    <div class="amount-box">
      <div class="label">Net Pay</div>
      <div class="amount">&#8377;{{ net_pay }}</div>
      <div class="label">{{ month_name }}</div>
    </div>
    <div class="info-row"><span class="key">Gross Earnings</span><span class="val">&#8377;{{ gross }}</span></div>
    <div class="info-row"><span class="key">Total Deductions</span><span class="val">&#8377;{{ deductions }}</span></div>
    <div class="info-row"><span class="key">Working Days</span><span class="val">{{ working_days }}</span></div>
    <div class="info-row"><span class="key">Days Present</span><span class="val">{{ present_days }}</span></div>
    <div class="info-row"><span class="key">Loss of Pay Days</span><span class="val">{{ lop }}</span></div>
    <p style="margin-top:18px;font-size:13px;color:#64748B;">
      The payslip PDF is attached to this email. For any queries, please contact HR.
    </p>
  </div>
  <div class="footer">
    This is an automated payslip from AttendPro.<br>
    &copy; {{ year }} {{ company_name }}
  </div>
</div>
</body>
</html>
"""


class EmailService:
    """Central email service for AttendPro."""

    def __init__(self):
        self.jinja = Environment(loader=BaseLoader())

    def _render(self, template_str: str, context: dict) -> str:
        tmpl = self.jinja.from_string(template_str)
        return tmpl.render(**context)

    def _build_message(self, to_email, subject, html_body, attachment_path=None):
        cfg = _get_smtp_config()
        from_name = cfg["from_name"] if cfg else FROM_NAME
        from_email = cfg["user"] if cfg else FROM_EMAIL
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = f"{from_name} <{from_email}>"
        msg["To"]      = to_email
        msg.attach(MIMEText(html_body, "html"))

        if attachment_path and os.path.exists(attachment_path):
            with open(attachment_path, "rb") as f:
                part = MIMEBase("application", "octet-stream")
                part.set_payload(f.read())
            encoders.encode_base64(part)
            part.add_header(
                "Content-Disposition",
                f"attachment; filename={os.path.basename(attachment_path)}"
            )
            msg.attach(part)

        return msg

    def _send(self, msg: MIMEMultipart, to_email: str) -> bool:
        """Send an email using DB config, fallback to env vars."""
        cfg = _get_smtp_config()
        host     = cfg["host"]     if cfg else SMTP_HOST
        port     = cfg["port"]     if cfg else SMTP_PORT
        user     = cfg["user"]     if cfg else SMTP_USER
        password = cfg["password"] if cfg else SMTP_PASSWORD

        if not user or not password:
            logger.warning("SMTP credentials not configured – skipping email send.")
            return False
        try:
            with smtplib.SMTP(host, port) as server:
                server.starttls()
                server.login(user, password)
                server.sendmail(user, to_email, msg.as_string())
            logger.info(f"Email sent to {to_email}: {msg['Subject']}")
            return True
        except Exception as exc:
            logger.error(f"Failed to send email to {to_email}: {exc}")
            return False

    # ── Public Methods ────────────────────────────────────────────────────────

    def send_absent_alert(
        self,
        employee_name: str,
        employee_id: int,
        employee_email: str,
        absent_date: Optional[date] = None,
        dashboard_url: str = "http://localhost:3000",
    ) -> bool:
        today = absent_date or date.today()
        html = self._render(ABSENT_ALERT_TEMPLATE, {
            "employee_name": employee_name,
            "employee_id": employee_id,
            "date": today.strftime("%A, %d %B %Y"),
            "company_name": COMPANY_NAME,
            "dashboard_url": dashboard_url,
            "year": today.year,
        })
        msg = self._build_message(
            to_email=employee_email,
            subject=f"Absence Alert – {today.strftime('%d %b %Y')} | {COMPANY_NAME}",
            html_body=html,
        )
        return self._send(msg, employee_email)

    def send_daily_summary(
        self,
        to_email: str,
        summary: dict,
        report_date: Optional[date] = None,
    ) -> bool:
        """
        summary = {
            total, present, absent, on_leave, late,
            absent_employees: [{name, department, last_seen}],
            late_employees:   [{name, department, check_in}]
        }
        """
        today = report_date or date.today()
        html = self._render(DAILY_SUMMARY_TEMPLATE, {
            "company_name": COMPANY_NAME,
            "date": today.strftime("%A, %d %B %Y"),
            "year": today.year,
            **summary,
        })
        msg = self._build_message(
            to_email=to_email,
            subject=f"Daily Attendance Summary – {today.strftime('%d %b %Y')} | {COMPANY_NAME}",
            html_body=html,
        )
        return self._send(msg, to_email)

    def send_payslip(
        self,
        employee_name: str,
        employee_email: str,
        payslip_data: dict,
        pdf_path: Optional[str] = None,
    ) -> bool:
        import calendar
        month_name = f"{calendar.month_name[payslip_data['pay_month']]} {payslip_data['pay_year']}"
        html = self._render(PAYSLIP_DELIVERY_TEMPLATE, {
            "employee_name": employee_name,
            "company_name": COMPANY_NAME,
            "month_name": month_name,
            "net_pay": f"{payslip_data['net_pay']:,.2f}",
            "gross": f"{payslip_data['gross_earnings']:,.2f}",
            "deductions": f"{payslip_data['total_deductions']:,.2f}",
            "working_days": payslip_data["working_days"],
            "present_days": payslip_data["present_days"],
            "lop": payslip_data.get("loss_of_pay_days", 0),
            "year": payslip_data["pay_year"],
        })
        msg = self._build_message(
            to_email=employee_email,
            subject=f"Payslip for {month_name} | {COMPANY_NAME}",
            html_body=html,
            attachment_path=pdf_path,
        )
        return self._send(msg, employee_email)

    def send_test(self, to_email: str) -> bool:
        html = f"""
        <div style="font-family:Arial;padding:30px;max-width:500px;margin:auto;
                    background:#F0F9FF;border-radius:12px;border:1px solid #BFDBFE;">
          <h2 style="color:#1E40AF;">&#10004; AttendPro Email Test</h2>
          <p>Email notifications are configured correctly for <strong>{COMPANY_NAME}</strong>.</p>
          <p style="color:#64748B;font-size:13px;">Sent from: {FROM_EMAIL}</p>
        </div>
        """
        msg = self._build_message(to_email, f"Test Email | {COMPANY_NAME}", html)
        return self._send(msg, to_email)


# Singleton
email_service = EmailService()
