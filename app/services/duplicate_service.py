"""Duplicate patient detection for smart registration workflows."""
import re
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from app.models.patient import Patient


def _normalize_phone(phone: Optional[str]) -> Optional[str]:
    if not phone:
        return None
    digits = re.sub(r"\D", "", phone)
    if not digits:
        return None
    if len(digits) > 10:
        digits = digits[-10:]
    return digits


def _normalize_email(email: Optional[str]) -> Optional[str]:
    if not email:
        return None
    return email.strip().lower()


def _normalize_name(name: Optional[str]) -> Optional[str]:
    if not name:
        return None
    return re.sub(r"\s+", " ", name.strip().lower())


def _name_tokens(name: Optional[str]) -> set:
    norm = _normalize_name(name)
    if not norm:
        return set()
    return {t for t in norm.split() if t}


async def find_duplicate_patients(
    db: AsyncSession,
    full_name: Optional[str] = None,
    phone: Optional[str] = None,
    email: Optional[str] = None,
    hospital_id: Optional[str] = None,
    hospital_ids_in: Optional[List[str]] = None,
    limit: int = 10,
) -> List[dict]:
    """Return existing patients that look like duplicates of the input.

    Matching rules (hospital-scoped when a scope is provided):
    - phone: last-10-digit normalized equality (high confidence)
    - email: case-insensitive equality (high confidence)
    - name: normalized token overlap (medium confidence)
    """
    scope_filter = []
    if hospital_ids_in:
        scope_filter.append(Patient.hospital_id.in_(hospital_ids_in))
    elif hospital_id:
        scope_filter.append(Patient.hospital_id == hospital_id)

    norm_phone = _normalize_phone(phone)
    norm_email = _normalize_email(email)
    norm_name = _normalize_name(full_name)
    name_tokens = _name_tokens(full_name)

    conditions = []
    if norm_phone:
        conditions.append(
            or_(
                Patient.phone == phone,
                Patient.phone.in_(["+91" + norm_phone, "+91-" + norm_phone, norm_phone]),
            )
        )
    if norm_email:
        conditions.append(Patient.email.ilike(norm_email))
    if norm_name:
        conditions.append(Patient.full_name.ilike(norm_name))
        if len(name_tokens) >= 2:
            for token in list(name_tokens)[:2]:
                conditions.append(Patient.full_name.ilike(f"%{token}%"))

    query = select(Patient)
    if scope_filter:
        query = query.where(scope_filter[0] if len(scope_filter) == 1 else or_(*scope_filter))
    if conditions:
        query = query.where(or_(*conditions))
    else:
        return []
    query = query.order_by(Patient.created_at.desc()).limit(limit)

    result = await db.execute(query)
    patients = list(result.scalars().all())

    candidates = []
    for p in patients:
        matched_on = []
        if norm_phone and _normalize_phone(p.phone) == norm_phone:
            matched_on.append("phone")
        if norm_email and _normalize_email(p.email) == norm_email:
            matched_on.append("email")
        if norm_name and _normalize_name(p.full_name) == norm_name:
            matched_on.append("full_name")
        elif name_tokens and _name_tokens(p.full_name).intersection(name_tokens):
            matched_on.append("name")
        if not matched_on:
            continue
        confidence = "high" if "phone" in matched_on or "email" in matched_on else "medium"
        candidates.append(
            {
                "id": str(p.id),
                "full_name": p.full_name,
                "gender": p.gender,
                "phone": p.phone,
                "email": p.email,
                "date_of_birth": p.date_of_birth,
                "age": p.age,
                "patient_source": p.patient_source,
                "status": p.status.value if hasattr(p.status, "value") else str(p.status),
                "matched_on": matched_on,
                "confidence": confidence,
            }
        )
    return candidates
