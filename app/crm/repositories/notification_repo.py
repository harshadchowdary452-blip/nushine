"""Notification repository."""
from __future__ import annotations
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.notification import Notification


class NotificationRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, notification: Notification) -> Notification:
        self.db.add(notification)
        await self.db.flush()
        return notification

    async def get_unread_count(self, user_id: str) -> int:
        query = select(func.count()).select_from(Notification).where(
            Notification.user_id == user_id,
            Notification.is_read == False,
        )
        result = await self.db.execute(query)
        return result.scalar() or 0
