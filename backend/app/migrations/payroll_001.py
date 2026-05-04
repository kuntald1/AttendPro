"""add payroll tables

Revision ID: payroll_001
Revises: <your_previous_revision>
Create Date: 2026-05-01
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'payroll_001'
down_revision = None   # set to your latest migration id
branch_labels = None
depends_on = None


def upgrade():
    # Enums
    pay_component = postgresql.ENUM(
        'basic', 'hra', 'transport', 'medical', 'special_allowance',
        'pf', 'esi', 'professional_tax', 'tds', 'loan',
        'other_earning', 'other_deduction',
        name='paycomponent'
    )
    component_type = postgresql.ENUM('earning', 'deduction', name='componenttype')
    payslip_status = postgresql.ENUM('draft', 'generated', 'paid', name='payslipstatus')
    pay_component.create(op.get_bind(), checkfirst=True)
    component_type.create(op.get_bind(), checkfirst=True)
    payslip_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        'salary_structures',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('employee_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False, unique=True),
        sa.Column('effective_from', sa.Date(), nullable=False),
        sa.Column('effective_to', sa.Date(), nullable=True),
        sa.Column('currency', sa.String(3), default='INR'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    op.create_table(
        'salary_components',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('structure_id', sa.Integer(), sa.ForeignKey('salary_structures.id'), nullable=False),
        sa.Column('component', pay_component, nullable=False),
        sa.Column('component_type', component_type, nullable=False),
        sa.Column('amount', sa.Float(), nullable=False, default=0.0),
        sa.Column('is_percentage', sa.Boolean(), default=False),
        sa.Column('percentage_of', sa.String(50), nullable=True),
    )

    op.create_table(
        'payslips',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('employee_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('salary_structure_id', sa.Integer(), sa.ForeignKey('salary_structures.id'), nullable=False),
        sa.Column('pay_month', sa.Integer(), nullable=False),
        sa.Column('pay_year', sa.Integer(), nullable=False),
        sa.Column('working_days', sa.Integer(), nullable=False),
        sa.Column('present_days', sa.Integer(), nullable=False),
        sa.Column('paid_leaves', sa.Integer(), default=0),
        sa.Column('loss_of_pay_days', sa.Integer(), default=0),
        sa.Column('gross_earnings', sa.Float(), nullable=False),
        sa.Column('total_deductions', sa.Float(), nullable=False),
        sa.Column('net_pay', sa.Float(), nullable=False),
        sa.Column('status', payslip_status, default='draft'),
        sa.Column('payment_date', sa.Date(), nullable=True),
        sa.Column('remarks', sa.Text(), nullable=True),
        sa.Column('pdf_path', sa.String(500), nullable=True),
        sa.Column('generated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        'payslip_items',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('payslip_id', sa.Integer(), sa.ForeignKey('payslips.id'), nullable=False),
        sa.Column('component', pay_component, nullable=False),
        sa.Column('component_type', component_type, nullable=False),
        sa.Column('label', sa.String(100), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
    )

    # Index for quick lookup
    op.create_index('ix_payslips_employee_month_year',
                    'payslips', ['employee_id', 'pay_year', 'pay_month'])


def downgrade():
    op.drop_table('payslip_items')
    op.drop_table('payslips')
    op.drop_table('salary_components')
    op.drop_table('salary_structures')
    for e in ('payslipstatus', 'componenttype', 'paycomponent'):
        op.execute(f'DROP TYPE IF EXISTS {e}')
