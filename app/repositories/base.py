from typing import Any, Dict, List, Optional, TypeVar, Generic, Type
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from app.database import Base

ModelType = TypeVar("ModelType", bound=Base)


class BaseRepository(Generic[ModelType]):
    def __init__(self, model: Type[ModelType], db: AsyncSession):
        self.model = model
        self.db = db

    async def create(self, **kwargs) -> ModelType:
        instance = self.model(**kwargs)
        self.db.add(instance)
        await self.db.flush()
        refresh_attrs = [r.key for r in instance.__mapper__.relationships if r.lazy == "selectin"]
        if refresh_attrs:
            await self.db.refresh(instance, attribute_names=refresh_attrs)
        else:
            await self.db.refresh(instance)
        return instance

    async def get(self, id: Any) -> Optional[ModelType]:
        query = select(self.model).where(self.model.id == id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_all(self, skip: int = 0, limit: int = 100, filters: Optional[Dict[str, Any]] = None, order_by: Optional[str] = None, descending: bool = False) -> List[ModelType]:
        query = select(self.model)
        if filters:
            for key, value in filters.items():
                if value is None:
                    continue
                if key.endswith("__in") and isinstance(value, (list, tuple, set)):
                    attr_name = key[:-4]
                    if hasattr(self.model, attr_name):
                        query = query.where(getattr(self.model, attr_name).in_(value))
                elif key.endswith("__ge"):
                    attr_name = key[:-4]
                    if hasattr(self.model, attr_name):
                        query = query.where(getattr(self.model, attr_name) >= value)
                elif key.endswith("__gt"):
                    attr_name = key[:-4]
                    if hasattr(self.model, attr_name):
                        query = query.where(getattr(self.model, attr_name) > value)
                elif key.endswith("__le"):
                    attr_name = key[:-4]
                    if hasattr(self.model, attr_name):
                        query = query.where(getattr(self.model, attr_name) <= value)
                elif key.endswith("__lt"):
                    attr_name = key[:-4]
                    if hasattr(self.model, attr_name):
                        query = query.where(getattr(self.model, attr_name) < value)
                elif key == "search" and hasattr(self.model, "full_name"):
                    query = query.where(self.model.full_name.ilike(f"%{value}%"))
                elif hasattr(self.model, key):
                    query = query.where(getattr(self.model, key) == value)
        if order_by and hasattr(self.model, order_by):
            order_col = getattr(self.model, order_by)
            query = query.order_by(order_col.desc() if descending else order_col)
        query = query.offset(skip).limit(limit)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def update(self, id: Any, **kwargs) -> Optional[ModelType]:
        instance = await self.get(id)
        if not instance:
            return None
        for key, value in kwargs.items():
            if hasattr(instance, key) and value is not None:
                setattr(instance, key, value)
        await self.db.flush()
        try:
            refresh_attrs = [r.key for r in instance.__mapper__.relationships if r.lazy == "selectin"]
            if refresh_attrs:
                await self.db.refresh(instance, attribute_names=refresh_attrs)
            else:
                await self.db.refresh(instance)
        except Exception:
            pass
        return instance

    async def delete(self, id: Any) -> bool:
        instance = await self.get(id)
        if not instance:
            return False
        await self.db.delete(instance)
        await self.db.flush()
        return True

    async def count(self, filters: Optional[Dict[str, Any]] = None) -> int:
        query = select(func.count(self.model.id))
        if filters:
            for key, value in filters.items():
                if hasattr(self.model, key) and value is not None:
                    query = query.where(getattr(self.model, key) == value)
        result = await self.db.execute(query)
        return result.scalar()
