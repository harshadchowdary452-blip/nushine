from datetime import datetime, date, timezone, timedelta
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text, case
from app.config import settings
from app.models.billing import Billing
from app.models.payment_transaction import PaymentTransaction
from app.models.hospital_monthly_expense import HospitalMonthlyExpense
from app.models.case import Case
from app.models.patient import Patient
from app.models.appointment import Appointment, AppointmentStatus
from app.models.user import User
from app.core.permissions import Role


def get_previous_date_range(period: str = "this_month", start_date: Optional[str] = None, end_date: Optional[str] = None):
    date_start, date_end = get_date_range(period, start_date, end_date)
    range_seconds = (date_end - date_start).total_seconds()
    prev_end = date_start
    prev_start = prev_end - timedelta(seconds=range_seconds)
    return prev_start, prev_end


def get_date_range(period: str = "this_month", start_date: Optional[str] = None, end_date: Optional[str] = None):
    now = datetime.now(timezone.utc)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)

    if period == "today":
        return today, today + timedelta(days=1)
    elif period == "yesterday":
        return today - timedelta(days=1), today
    elif period == "last_month":
        month_start = today.replace(day=1)
        last_month_end = month_start
        last_month_start = (month_start - timedelta(days=1)).replace(day=1)
        return last_month_start, last_month_end
    elif period == "last_7_days":
        return today - timedelta(days=6), today + timedelta(days=1)
    elif period == "last_30_days":
        return today - timedelta(days=29), today + timedelta(days=1)
    elif period == "this_week":
        week_start = today - timedelta(days=today.weekday())
        return week_start, week_start + timedelta(days=7)
    elif period == "last_week":
        this_week_start = today - timedelta(days=today.weekday())
        last_week_start = this_week_start - timedelta(days=7)
        return last_week_start, this_week_start
    elif period == "this_month":
        month_start = today.replace(day=1)
        next_month = month_start.replace(month=month_start.month % 12 + 1, day=1) if month_start.month < 12 else month_start.replace(year=month_start.year + 1, month=1, day=1)
        return month_start, next_month
    elif period == "last_3_months":
        three_months_ago = today.replace(day=1) - timedelta(days=90)
        if three_months_ago.month != today.month:
            three_months_ago = three_months_ago.replace(day=1)
        return three_months_ago, today + timedelta(days=1)
    elif period == "last_6_months":
        return today.replace(day=1) - timedelta(days=180), today + timedelta(days=1)
    elif period == "this_quarter":
        quarter_month = ((now.month - 1) // 3) * 3 + 1
        quarter_start = today.replace(month=quarter_month, day=1)
        quarter_end_month = quarter_month + 3
        if quarter_end_month > 12:
            quarter_end = quarter_start.replace(year=quarter_start.year + 1, month=1, day=1)
        else:
            quarter_end = quarter_start.replace(month=quarter_end_month, day=1)
        return quarter_start, quarter_end
    elif period == "last_quarter":
        current_quarter_month = ((now.month - 1) // 3) * 3 + 1
        last_quarter_end = today.replace(month=current_quarter_month, day=1)
        last_quarter_start_month = current_quarter_month - 3
        if last_quarter_start_month < 1:
            last_quarter_start = last_quarter_end.replace(year=last_quarter_end.year - 1, month=last_quarter_start_month + 12, day=1)
        else:
            last_quarter_start = last_quarter_end.replace(month=last_quarter_start_month, day=1)
        return last_quarter_start, last_quarter_end
    elif period == "this_year":
        year_start = today.replace(month=1, day=1)
        return year_start, year_start.replace(year=year_start.year + 1, month=1, day=1)
    elif period == "last_year":
        this_year_start = today.replace(month=1, day=1)
        last_year_start = this_year_start.replace(year=this_year_start.year - 1, month=1, day=1)
        return last_year_start, this_year_start
    elif period == "custom" and start_date and end_date:
        try:
            sd = datetime.fromisoformat(start_date).replace(tzinfo=timezone.utc) if "T" in start_date else datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            ed = datetime.fromisoformat(end_date).replace(tzinfo=timezone.utc) if "T" in end_date else datetime.strptime(end_date, "%Y-%m-%d").replace(tzinfo=timezone.utc) + timedelta(days=1)
            return sd, ed
        except (ValueError, TypeError):
            month_start = today.replace(day=1)
            next_month = month_start.replace(month=month_start.month % 12 + 1, day=1) if month_start.month < 12 else month_start.replace(year=month_start.year + 1, month=1, day=1)
            return month_start, next_month
    else:
        month_start = today.replace(day=1)
        next_month = month_start.replace(month=month_start.month % 12 + 1, day=1) if month_start.month < 12 else month_start.replace(year=month_start.year + 1, month=1, day=1)
        return month_start, next_month


def _txn_totals_subquery():
    """Sum of all recorded payment transactions per billing (subquery)."""
    return (
        select(
            PaymentTransaction.billing_id.label("billing_id"),
            func.coalesce(func.sum(PaymentTransaction.amount), 0).label("txn_total"),
        )
        .group_by(PaymentTransaction.billing_id)
        .subquery()
    )


def _baseline_revenue_expr(txn_totals):
    """Amount paid when the billing was created (paid_amount minus later transactions).

    Subsequent partial payments create rows in payment_transactions, so the
    remainder of paid_amount corresponds to the initial payment made at creation.
    Clamped at 0 so billings with no initial payment contribute nothing.
    """
    baseline = Billing.paid_amount - func.coalesce(txn_totals.c.txn_total, 0)
    return case((baseline > 0, baseline), else_=0)


async def calculate_revenue_for_range(db: AsyncSession, case_ids: list[str] = None,
                                      date_start: datetime | None = None,
                                      date_end: datetime | None = None) -> float:
    if date_start is None:
        now = datetime.now(timezone.utc)
        date_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if date_end is None:
        date_start = date_start.replace(day=1)
        date_end = date_start.replace(month=date_start.month % 12 + 1, day=1) if date_start.month < 12 else date_start.replace(year=date_start.year + 1, month=1, day=1)

    # Revenue is attributed to the period in which each rupee was actually paid.
    # Amounts paid at billing creation belong to Billing.created_at; amounts
    # received via later partial payments belong to the transaction's created_at.
    # (Billing.updated_at cannot be used: any later payment updates it, which
    # would re-attribute earlier installments to the later month.)
    txn_totals = _txn_totals_subquery()
    baseline_q = (
        select(func.coalesce(func.sum(_baseline_revenue_expr(txn_totals)), 0))
        .select_from(Billing)
        .outerjoin(txn_totals, txn_totals.c.billing_id == Billing.id)
        .where(Billing.created_at >= date_start, Billing.created_at < date_end)
    )
    if case_ids is not None:
        baseline_q = baseline_q.where(Billing.case_id.in_(case_ids))
    baseline = float((await db.execute(baseline_q)).scalar() or 0)

    txn_q = (
        select(func.coalesce(func.sum(PaymentTransaction.amount), 0))
        .join(Billing, PaymentTransaction.billing_id == Billing.id)
        .where(PaymentTransaction.created_at >= date_start, PaymentTransaction.created_at < date_end)
    )
    if case_ids is not None:
        txn_q = txn_q.where(Billing.case_id.in_(case_ids))
    txn_total = float((await db.execute(txn_q)).scalar() or 0)

    return baseline + txn_total


async def revenue_bucket_map(db: AsyncSession, case_ids: list[str] = None,
                             date_start: datetime | None = None,
                             date_end: datetime | None = None,
                             python_format: str = "%Y-%m",
                             sql_format: str = "YYYY-MM") -> dict:
    """Revenue bucketed by the date each payment was actually received.

    Returns a dict mapping bucket keys (formatted per the given formats) to the
    revenue received within that bucket, based on payment dates rather than
    Billing.updated_at.
    """
    def _bucket_expr(column):
        if settings.DB_IS_POSTGRESQL:
            return func.to_char(column, sql_format)
        return func.strftime(python_format, column)

    txn_totals = _txn_totals_subquery()

    base_q = (
        select(
            _bucket_expr(Billing.created_at).label("bucket"),
            func.sum(_baseline_revenue_expr(txn_totals)).label("revenue"),
        )
        .select_from(Billing)
        .outerjoin(txn_totals, txn_totals.c.billing_id == Billing.id)
        .where(Billing.created_at >= date_start, Billing.created_at < date_end)
        .group_by(text("bucket"))
    )
    if case_ids is not None:
        base_q = base_q.where(Billing.case_id.in_(case_ids))

    txn_q = (
        select(
            _bucket_expr(PaymentTransaction.created_at).label("bucket"),
            func.sum(PaymentTransaction.amount).label("revenue"),
        )
        .join(Billing, PaymentTransaction.billing_id == Billing.id)
        .where(PaymentTransaction.created_at >= date_start, PaymentTransaction.created_at < date_end)
        .group_by(text("bucket"))
    )
    if case_ids is not None:
        txn_q = txn_q.where(Billing.case_id.in_(case_ids))

    buckets: dict = {}
    for row in (await db.execute(base_q)).all():
        buckets[row[0]] = buckets.get(row[0], 0.0) + float(row[1] or 0)
    for row in (await db.execute(txn_q)).all():
        buckets[row[0]] = buckets.get(row[0], 0.0) + float(row[1] or 0)
    return buckets


async def revenue_by_doctor_for_range(db: AsyncSession, case_ids: list[str] = None,
                                      date_start: datetime | None = None,
                                      date_end: datetime | None = None) -> dict:
    """Revenue per doctor in the period, attributed by actual payment dates."""
    txn_totals = _txn_totals_subquery()

    base_q = (
        select(
            Case.doctor_id.label("doctor_id"),
            func.sum(_baseline_revenue_expr(txn_totals)).label("revenue"),
        )
        .select_from(Billing)
        .join(Case, Billing.case_id == Case.id)
        .outerjoin(txn_totals, txn_totals.c.billing_id == Billing.id)
        .where(Billing.created_at >= date_start, Billing.created_at < date_end,
               Case.doctor_id.isnot(None))
        .group_by(Case.doctor_id)
    )
    if case_ids is not None:
        base_q = base_q.where(Billing.case_id.in_(case_ids))

    txn_q = (
        select(
            Case.doctor_id.label("doctor_id"),
            func.sum(PaymentTransaction.amount).label("revenue"),
        )
        .select_from(PaymentTransaction)
        .join(Billing, PaymentTransaction.billing_id == Billing.id)
        .join(Case, Billing.case_id == Case.id)
        .where(PaymentTransaction.created_at >= date_start, PaymentTransaction.created_at < date_end,
               Case.doctor_id.isnot(None))
        .group_by(Case.doctor_id)
    )
    if case_ids is not None:
        txn_q = txn_q.where(Billing.case_id.in_(case_ids))

    revenue: dict = {}
    for row in (await db.execute(base_q)).all():
        if row[0] is not None:
            revenue[row[0]] = revenue.get(row[0], 0.0) + float(row[1] or 0)
    for row in (await db.execute(txn_q)).all():
        if row[0] is not None:
            revenue[row[0]] = revenue.get(row[0], 0.0) + float(row[1] or 0)
    return revenue


async def payment_method_breakdown_for_range(db: AsyncSession, case_ids: list[str] = None,
                                             date_start: datetime | None = None,
                                             date_end: datetime | None = None) -> dict:
    """Payment-method breakdown for the period, attributed by actual payment dates."""
    txn_totals = _txn_totals_subquery()

    base_q = (
        select(
            Billing.payment_method.label("method"),
            func.sum(_baseline_revenue_expr(txn_totals)).label("amount"),
        )
        .select_from(Billing)
        .outerjoin(txn_totals, txn_totals.c.billing_id == Billing.id)
        .where(Billing.created_at >= date_start, Billing.created_at < date_end)
        .group_by(Billing.payment_method)
    )
    if case_ids is not None:
        base_q = base_q.where(Billing.case_id.in_(case_ids))

    txn_q = (
        select(
            PaymentTransaction.payment_method.label("method"),
            func.sum(PaymentTransaction.amount).label("amount"),
        )
        .join(Billing, PaymentTransaction.billing_id == Billing.id)
        .where(PaymentTransaction.created_at >= date_start, PaymentTransaction.created_at < date_end)
        .group_by(PaymentTransaction.payment_method)
    )
    if case_ids is not None:
        txn_q = txn_q.where(Billing.case_id.in_(case_ids))

    breakdown: dict = {}
    for row in (await db.execute(base_q)).all():
        breakdown[row[0]] = breakdown.get(row[0], 0.0) + float(row[1] or 0)
    for row in (await db.execute(txn_q)).all():
        breakdown[row[0]] = breakdown.get(row[0], 0.0) + float(row[1] or 0)
    return breakdown


async def calculate_revenue(db: AsyncSession, case_ids: list[str] = None, period: str = "this_month",
                            start_date: Optional[str] = None, end_date: Optional[str] = None) -> float:
    date_start, date_end = get_date_range(period, start_date, end_date)
    return await calculate_revenue_for_range(db, case_ids, date_start, date_end)


async def calculate_expenses(db: AsyncSession, hospital_ids: list[str] = None, period: str = "this_month",
                             start_date: Optional[str] = None, end_date: Optional[str] = None,
                             expense_month: Optional[int] = None, expense_year: Optional[int] = None) -> float:
    date_start, date_end = get_date_range(period, start_date, end_date)

    if expense_month is not None and expense_year is not None:
        query = select(func.sum(HospitalMonthlyExpense.amount)).where(
            HospitalMonthlyExpense.expense_month == expense_month,
            HospitalMonthlyExpense.expense_year == expense_year,
        )
    else:
        query = select(func.sum(HospitalMonthlyExpense.amount)).where(
            HospitalMonthlyExpense.expense_date >= date_start.date() if hasattr(date_start, 'date') else date_start,
            HospitalMonthlyExpense.expense_date < date_end.date() if hasattr(date_end, 'date') else date_end,
        )

    if hospital_ids is not None:
        query = query.where(HospitalMonthlyExpense.hospital_id.in_(hospital_ids))
    result = await db.execute(query)
    return float(result.scalar() or 0)


async def calculate_expenses_for_date_range(db: AsyncSession, hospital_ids: list[str] = None,
                                            date_start: Optional[datetime] = None,
                                            date_end: Optional[datetime] = None) -> float:
    if not date_start:
        now = datetime.now(timezone.utc)
        date_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if not date_end:
        next_month = date_start.replace(month=date_start.month % 12 + 1, day=1) if date_start.month < 12 else date_start.replace(year=date_start.year + 1, month=1, day=1)
        date_end = next_month

    sd = date_start.date() if hasattr(date_start, 'date') else date_start
    ed = date_end.date() if hasattr(date_end, 'date') else date_end
    query = select(func.sum(HospitalMonthlyExpense.amount)).where(
        HospitalMonthlyExpense.expense_date >= sd,
        HospitalMonthlyExpense.expense_date < ed,
    )
    if hospital_ids is not None:
        query = query.where(HospitalMonthlyExpense.hospital_id.in_(hospital_ids))
    result = await db.execute(query)
    return float(result.scalar() or 0)


async def calculate_profit(revenue: float, expenses: float) -> float:
    return revenue - expenses


async def calculate_profit_margin(revenue: float, profit: float) -> float:
    if revenue == 0:
        return 0.0
    return round((profit / revenue) * 100, 2)


async def revenue_trend_with_expenses_range(db: AsyncSession, case_ids: list[str] = None,
                                            hospital_ids: list[str] = None,
                                            date_start: datetime | None = None,
                                            date_end: datetime | None = None) -> list:
    if date_start is None:
        now = datetime.now(timezone.utc)
        date_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if date_end is None:
        date_start = date_start.replace(day=1)
        date_end = date_start.replace(month=date_start.month % 12 + 1, day=1) if date_start.month < 12 else date_start.replace(year=date_start.year + 1, month=1, day=1)
    range_days = (date_end - date_start).days

    if range_days <= 1:
        python_format = '%Y-%m-%d %H:00'
        sql_format = 'YYYY-MM-DD HH24:00' if settings.DB_IS_POSTGRESQL else python_format
        group_label = 'hour'
    elif range_days <= 31:
        python_format = '%Y-%m-%d'
        sql_format = 'YYYY-MM-DD' if settings.DB_IS_POSTGRESQL else python_format
        group_label = 'day'
    else:
        python_format = '%Y-%m'
        sql_format = 'YYYY-MM' if settings.DB_IS_POSTGRESQL else python_format
        group_label = 'month'

    date_format = python_format
    revenue_map = await revenue_bucket_map(db, case_ids, date_start, date_end, python_format, sql_format)

    result = []
    if group_label == 'hour':
        cursor = date_start
        while cursor < date_end:
            key = cursor.strftime(date_format)
            rev = revenue_map.get(key, 0)
            exp_query = select(func.sum(HospitalMonthlyExpense.amount)).where(
                HospitalMonthlyExpense.expense_date >= cursor.date(),
                HospitalMonthlyExpense.expense_date < (cursor + timedelta(hours=1)).date(),
            )
            if hospital_ids is not None:
                exp_query = exp_query.where(HospitalMonthlyExpense.hospital_id.in_(hospital_ids))
            exp_r = await db.execute(exp_query)
            exp = float(exp_r.scalar() or 0)
            profit = rev - exp
            profit_margin = round((profit / rev * 100), 2) if rev > 0 else 0
            result.append({"month": key, "revenue": rev, "expenses": exp, "profit": profit, "profit_margin": profit_margin})
            cursor += timedelta(hours=1)
    elif group_label == 'day':
        cursor = date_start
        while cursor < date_end:
            key = cursor.strftime(date_format)
            rev = revenue_map.get(key, 0)
            exp_query = select(func.sum(HospitalMonthlyExpense.amount)).where(
                HospitalMonthlyExpense.expense_date >= cursor.date(),
                HospitalMonthlyExpense.expense_date < (cursor + timedelta(days=1)).date(),
            )
            if hospital_ids is not None:
                exp_query = exp_query.where(HospitalMonthlyExpense.hospital_id.in_(hospital_ids))
            exp_r = await db.execute(exp_query)
            exp = float(exp_r.scalar() or 0)
            profit = rev - exp
            profit_margin = round((profit / rev * 100), 2) if rev > 0 else 0
            result.append({"month": key, "revenue": rev, "expenses": exp, "profit": profit, "profit_margin": profit_margin})
            cursor += timedelta(days=1)
    else:
        cursor = date_start.replace(day=1)
        while cursor < date_end:
            key = cursor.strftime(date_format)
            rev = revenue_map.get(key, 0)
            month_end = cursor.replace(month=cursor.month % 12 + 1, day=1) if cursor.month < 12 else cursor.replace(year=cursor.year + 1, month=1, day=1)
            exp_query = select(func.sum(HospitalMonthlyExpense.amount)).where(
                HospitalMonthlyExpense.expense_date >= cursor.date(),
                HospitalMonthlyExpense.expense_date < month_end.date(),
            )
            if hospital_ids is not None:
                exp_query = exp_query.where(HospitalMonthlyExpense.hospital_id.in_(hospital_ids))
            exp_r = await db.execute(exp_query)
            exp = float(exp_r.scalar() or 0)
            profit = rev - exp
            profit_margin = round((profit / rev * 100), 2) if rev > 0 else 0
            result.append({"month": key, "revenue": rev, "expenses": exp, "profit": profit, "profit_margin": profit_margin})
            if cursor.month == 12:
                cursor = cursor.replace(year=cursor.year + 1, month=1)
            else:
                cursor = cursor.replace(month=cursor.month + 1)

    if not result:
        return [{"month": date_start.strftime(date_format), "revenue": 0, "expenses": 0, "profit": 0, "profit_margin": 0}]

    return result


async def revenue_trend_with_expenses(db: AsyncSession, case_ids: list[str] = None,
                                      hospital_ids: list[str] = None,
                                      period: str = "this_month",
                                      start_date: Optional[str] = None,
                                      end_date: Optional[str] = None) -> list:
    date_start, date_end = get_date_range(period, start_date, end_date)
    return await revenue_trend_with_expenses_range(db, case_ids, hospital_ids, date_start, date_end)
