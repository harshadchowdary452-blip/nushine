from datetime import datetime, date, timezone, timedelta
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from app.config import settings
from app.models.billing import Billing
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
        return today - timedelta(days=7), today + timedelta(days=1)
    elif period == "last_30_days":
        return today - timedelta(days=30), today + timedelta(days=1)
    elif period == "this_week":
        week_start = today - timedelta(days=today.weekday())
        return week_start, week_start + timedelta(days=7)
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
    elif period == "this_year":
        year_start = today.replace(month=1, day=1)
        return year_start, year_start.replace(year=year_start.year + 1, month=1, day=1)
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


async def calculate_revenue(db: AsyncSession, case_ids: list[str] = None, period: str = "this_month",
                            start_date: Optional[str] = None, end_date: Optional[str] = None) -> float:
    date_start, date_end = get_date_range(period, start_date, end_date)
    query = select(func.sum(Billing.paid_amount)).where(
        Billing.updated_at >= date_start, Billing.updated_at < date_end,
    )
    if case_ids is not None:
        query = query.where(Billing.case_id.in_(case_ids))
    result = await db.execute(query)
    return float(result.scalar() or 0)


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


async def revenue_trend_with_expenses(db: AsyncSession, case_ids: list[str] = None,
                                      hospital_ids: list[str] = None,
                                      period: str = "this_month",
                                      start_date: Optional[str] = None,
                                      end_date: Optional[str] = None) -> list:
    date_start, date_end = get_date_range(period, start_date, end_date)
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
    query = select(
        (func.to_char(Billing.updated_at, sql_format) if settings.DB_IS_POSTGRESQL else func.strftime(python_format, Billing.updated_at)).label(group_label),
        func.sum(Billing.paid_amount).label('revenue'),
    ).where(Billing.updated_at >= date_start, Billing.updated_at < date_end)
    if case_ids is not None:
        query = query.where(Billing.case_id.in_(case_ids))
    query = query.group_by(text(group_label)).order_by(text(group_label))
    r = await db.execute(query)
    revenue_map = {}
    for row in r.all():
        revenue_map[row[0]] = float(row[1] or 0)

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
