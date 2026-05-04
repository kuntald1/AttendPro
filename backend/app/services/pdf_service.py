"""
Payslip PDF generation using ReportLab.
Generates professional payslip PDFs stored in /app/payslips/
"""
import os
import calendar
from datetime import datetime
from typing import Optional

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph,
    Spacer, HRFlowable
)
from reportlab.platypus.flowables import KeepTogether

# ── Brand colours ─────────────────────────────────────────────────────────────
PRIMARY   = colors.HexColor("#1E40AF")   # blue-800
SECONDARY = colors.HexColor("#3B82F6")   # blue-500
ACCENT    = colors.HexColor("#DBEAFE")   # blue-100
DARK      = colors.HexColor("#1E293B")   # slate-800
MUTED     = colors.HexColor("#64748B")   # slate-500
LIGHT_BG  = colors.HexColor("#F8FAFC")   # slate-50
WHITE     = colors.white
RED_DEDUCT = colors.HexColor("#EF4444")
GREEN_EARN = colors.HexColor("#22C55E")

PAYSLIP_DIR = os.getenv("PAYSLIP_DIR", "/app/payslips")
os.makedirs(PAYSLIP_DIR, exist_ok=True)


def _rupee(amount: float) -> str:
    """Format amount as Indian Rupees."""
    return f"\u20b9{amount:,.2f}"


def _month_name(month: int, year: int) -> str:
    return f"{calendar.month_name[month]} {year}"


def generate_payslip_pdf(payslip_data: dict) -> str:
    """
    Generate a payslip PDF and return the file path.

    payslip_data keys:
        id, pay_month, pay_year, employee_name, employee_id,
        employee_email, department, designation, joining_date,
        pan_number, bank_account, bank_name, ifsc,
        working_days, present_days, paid_leaves, loss_of_pay_days,
        gross_earnings, total_deductions, net_pay,
        payment_date, remarks,
        company_name, company_address, company_logo (path, optional),
        items: [ {label, amount, component_type: earning|deduction} ]
    """
    emp_id = payslip_data.get("employee_id", "EMP")
    month  = payslip_data["pay_month"]
    year   = payslip_data["pay_year"]
    filename = f"payslip_{emp_id}_{year}_{month:02d}.pdf"
    filepath = os.path.join(PAYSLIP_DIR, filename)

    doc = SimpleDocTemplate(
        filepath,
        pagesize=A4,
        rightMargin=15*mm, leftMargin=15*mm,
        topMargin=15*mm, bottomMargin=15*mm,
        title=f"Payslip – {_month_name(month, year)}",
    )

    styles = getSampleStyleSheet()
    story  = []

    # ── Header ──────────────────────────────────────────────────────────────
    company_name    = payslip_data.get("company_name", "Your Company Pvt. Ltd.")
    company_address = payslip_data.get("company_address", "")

    header_data = [[
        Paragraph(
            f'<font color="#1E40AF" size="16"><b>{company_name}</b></font><br/>'
            f'<font color="#64748B" size="8">{company_address}</font>',
            ParagraphStyle("co", fontName="Helvetica", fontSize=12)
        ),
        Paragraph(
            f'<font color="#1E40AF" size="14"><b>PAYSLIP</b></font><br/>'
            f'<font color="#64748B" size="9">{_month_name(month, year)}</font>',
            ParagraphStyle("title", fontName="Helvetica", fontSize=12, alignment=TA_RIGHT)
        ),
    ]]
    header_tbl = Table(header_data, colWidths=["60%", "40%"])
    header_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(header_tbl)
    story.append(HRFlowable(width="100%", thickness=2, color=PRIMARY, spaceAfter=6))

    # ── Employee Info ────────────────────────────────────────────────────────
    def info_cell(label, value):
        return [
            Paragraph(f'<font color="#64748B" size="7">{label}</font>',
                      ParagraphStyle("lbl", fontName="Helvetica")),
            Paragraph(f'<font color="#1E293B" size="9"><b>{value or "–"}</b></font>',
                      ParagraphStyle("val", fontName="Helvetica")),
        ]

    emp = payslip_data
    info_rows = [
        info_cell("Employee Name", emp.get("employee_name")),
        info_cell("Employee ID", f"EMP-{emp.get('employee_id', '')}"),
        info_cell("Designation", emp.get("designation")),
        info_cell("Department", emp.get("department")),
        info_cell("Date of Joining", emp.get("joining_date")),
        info_cell("PAN Number", emp.get("pan_number")),
        info_cell("Bank Account", emp.get("bank_account")),
        info_cell("Bank Name", emp.get("bank_name")),
        info_cell("IFSC Code", emp.get("ifsc")),
        info_cell("Payment Date", str(emp.get("payment_date", ""))),
    ]

    # Layout as 2-column grid (label on left, value on right, 2 fields per row)
    grid_data = []
    for i in range(0, len(info_rows), 2):
        row = info_rows[i]
        row2 = info_rows[i+1] if i+1 < len(info_rows) else [Paragraph("", styles["Normal"]), Paragraph("", styles["Normal"])]
        grid_data.append([row[0], row[1], row2[0], row2[1]])

    info_tbl = Table(grid_data, colWidths=["18%", "32%", "18%", "32%"])
    info_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), LIGHT_BG),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [WHITE, LIGHT_BG]),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E2E8F0")),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(info_tbl)
    story.append(Spacer(1, 6))

    # ── Attendance Summary ───────────────────────────────────────────────────
    att_data = [
        [
            Paragraph('<font color="#1E40AF" size="9"><b>Attendance Summary</b></font>',
                      ParagraphStyle("ah", fontName="Helvetica")),
            "", "", ""
        ],
        [
            Paragraph("Working Days", ParagraphStyle("al", fontName="Helvetica", fontSize=8, textColor=MUTED)),
            Paragraph(f"<b>{emp.get('working_days', 0)}</b>", ParagraphStyle("av", fontName="Helvetica", fontSize=9)),
            Paragraph("Present Days", ParagraphStyle("al2", fontName="Helvetica", fontSize=8, textColor=MUTED)),
            Paragraph(f"<b>{emp.get('present_days', 0)}</b>", ParagraphStyle("av2", fontName="Helvetica", fontSize=9)),
        ],
        [
            Paragraph("Paid Leaves", ParagraphStyle("al3", fontName="Helvetica", fontSize=8, textColor=MUTED)),
            Paragraph(f"<b>{emp.get('paid_leaves', 0)}</b>", ParagraphStyle("av3", fontName="Helvetica", fontSize=9)),
            Paragraph("Loss of Pay Days", ParagraphStyle("al4", fontName="Helvetica", fontSize=8, textColor=MUTED)),
            Paragraph(f"<b>{emp.get('loss_of_pay_days', 0)}</b>", ParagraphStyle("av4", fontName="Helvetica", fontSize=9)),
        ],
    ]
    att_tbl = Table(att_data, colWidths=["25%", "25%", "25%", "25%"])
    att_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
        ("SPAN", (0, 0), (-1, 0)),
        ("ALIGN", (0, 0), (-1, 0), "LEFT"),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#BFDBFE")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(att_tbl)
    story.append(Spacer(1, 6))

    # ── Earnings & Deductions Table ──────────────────────────────────────────
    items = payslip_data.get("items", [])
    earnings   = [i for i in items if i["component_type"].lower() == "earning"]
    deductions = [i for i in items if i["component_type"].lower() == "deduction"]

    max_rows = max(len(earnings), len(deductions))

    ed_header = [
        Paragraph('<font color="white" size="9"><b>EARNINGS</b></font>',
                  ParagraphStyle("eh", fontName="Helvetica", alignment=TA_CENTER)),
        Paragraph('<font color="white" size="9"><b>Amount</b></font>',
                  ParagraphStyle("eh2", fontName="Helvetica", alignment=TA_RIGHT)),
        Paragraph('<font color="white" size="9"><b>DEDUCTIONS</b></font>',
                  ParagraphStyle("dh", fontName="Helvetica", alignment=TA_CENTER)),
        Paragraph('<font color="white" size="9"><b>Amount</b></font>',
                  ParagraphStyle("dh2", fontName="Helvetica", alignment=TA_RIGHT)),
    ]

    ed_rows = [ed_header]
    for i in range(max_rows):
        e = earnings[i]   if i < len(earnings)   else None
        d = deductions[i] if i < len(deductions) else None
        row = [
            Paragraph(e["label"] if e else "", ParagraphStyle("el", fontName="Helvetica", fontSize=9)),
            Paragraph(_rupee(e["amount"]) if e else "",
                      ParagraphStyle("ea", fontName="Helvetica", fontSize=9, alignment=TA_RIGHT)),
            Paragraph(d["label"] if d else "", ParagraphStyle("dl", fontName="Helvetica", fontSize=9)),
            Paragraph(_rupee(d["amount"]) if d else "",
                      ParagraphStyle("da", fontName="Helvetica", fontSize=9, alignment=TA_RIGHT,
                                     textColor=RED_DEDUCT if d else DARK)),
        ]
        ed_rows.append(row)

    # Totals row
    ed_rows.append([
        Paragraph('<b>Gross Earnings</b>', ParagraphStyle("gt", fontName="Helvetica", fontSize=9)),
        Paragraph(f'<b>{_rupee(emp["gross_earnings"])}</b>',
                  ParagraphStyle("ga", fontName="Helvetica", fontSize=9, alignment=TA_RIGHT,
                                 textColor=GREEN_EARN)),
        Paragraph('<b>Total Deductions</b>', ParagraphStyle("dt", fontName="Helvetica", fontSize=9)),
        Paragraph(f'<b>{_rupee(emp["total_deductions"])}</b>',
                  ParagraphStyle("da2", fontName="Helvetica", fontSize=9, alignment=TA_RIGHT,
                                 textColor=RED_DEDUCT)),
    ])

    ed_tbl = Table(ed_rows, colWidths=["32%", "18%", "32%", "18%"])
    row_count = len(ed_rows)
    ed_tbl.setStyle(TableStyle([
        # Header
        ("BACKGROUND", (0, 0), (1, 0), PRIMARY),
        ("BACKGROUND", (2, 0), (3, 0), colors.HexColor("#DC2626")),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        # Body alternating
        ("ROWBACKGROUNDS", (0, 1), (-1, row_count - 2), [WHITE, LIGHT_BG]),
        # Totals row
        ("BACKGROUND", (0, row_count-1), (-1, row_count-1), colors.HexColor("#F1F5F9")),
        ("FONTNAME", (0, row_count-1), (-1, row_count-1), "Helvetica-Bold"),
        ("LINEABOVE", (0, row_count-1), (-1, row_count-1), 1, PRIMARY),
        # Grid
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E2E8F0")),
        # Padding
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        # Vertical middle line
        ("LINEAFTER", (1, 0), (1, -1), 1, colors.HexColor("#CBD5E1")),
    ]))
    story.append(ed_tbl)
    story.append(Spacer(1, 6))

    # ── Net Pay Banner ───────────────────────────────────────────────────────
    net_data = [[
        Paragraph(
            f'<font color="white" size="11"><b>NET PAY: {_rupee(emp["net_pay"])}</b></font>',
            ParagraphStyle("np", fontName="Helvetica", alignment=TA_CENTER)
        )
    ]]
    net_tbl = Table(net_data, colWidths=["100%"])
    net_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PRIMARY),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
    ]))
    story.append(net_tbl)
    story.append(Spacer(1, 4))

    # Amount in words
    try:
        from num2words import num2words
        net_words = num2words(int(emp["net_pay"]), lang="en_IN").title()
        story.append(Paragraph(
            f'<font color="#64748B" size="8">Amount in Words: <b>{net_words} Rupees Only</b></font>',
            ParagraphStyle("words", fontName="Helvetica")
        ))
    except ImportError:
        pass

    story.append(Spacer(1, 10))

    # ── Remarks ──────────────────────────────────────────────────────────────
    if emp.get("remarks"):
        story.append(Paragraph(
            f'<font color="#64748B" size="8"><b>Remarks:</b> {emp["remarks"]}</font>',
            ParagraphStyle("rem", fontName="Helvetica")
        ))
        story.append(Spacer(1, 6))

    # ── Footer ───────────────────────────────────────────────────────────────
    story.append(HRFlowable(width="100%", thickness=0.5, color=MUTED, spaceAfter=4))
    story.append(Paragraph(
        '<font color="#64748B" size="7">This is a computer-generated payslip and does not require a signature. '
        f'Generated by AttendPro on {datetime.now().strftime("%d %b %Y %H:%M")}.</font>',
        ParagraphStyle("footer", fontName="Helvetica", alignment=TA_CENTER)
    ))

    doc.build(story)
    return filepath
