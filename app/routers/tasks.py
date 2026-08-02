from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func, or_
from typing import Optional
from datetime import datetime, timezone, timedelta
from app.database import get_db
from app.dependencies import get_current_user
from app.models.task import Task, TaskStatus, TaskPriority
from app.models.user import User
from app.schemas.task import (
    TaskCreate, TaskUpdate, TaskStatusUpdate, TaskAssigneeUpdate,
    TaskResponse, TaskStats,
)

router = APIRouter(prefix="/tasks", tags=["Tasks"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _day_bounds():
    now = _now()
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return start, start + timedelta(days=1)


def _task_to_dict(task: Task, assignee=None, creator=None) -> dict:
    return {
        "id": str(task.id),
        "title": task.title,
        "description": task.description,
        "due_date": task.due_date.isoformat() if task.due_date else None,
        "priority": task.priority,
        "status": task.status,
        "assignee_id": str(task.assignee_id) if task.assignee_id else None,
        "assignee_name": assignee.full_name if assignee else None,
        "created_by": str(task.created_by),
        "created_by_name": creator.full_name if creator else None,
        "entity_type": task.entity_type,
        "entity_id": task.entity_id,
        "completed_at": task.completed_at.isoformat() if task.completed_at else None,
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "updated_at": task.updated_at.isoformat() if task.updated_at else None,
        "is_overdue": bool(
            task.due_date
            and task.status != TaskStatus.DONE
            and task.due_date < _now()
        ),
    }


def _visible_tasks_query(current_user: dict):
    uid = current_user.get("sub")
    hospital_id = current_user.get("hospital_id")
    return select(Task).where(
        or_(
            Task.created_by == uid,
            Task.assignee_id == uid,
            Task.hospital_id == hospital_id if hospital_id else False,
        )
    )


def _can_manage(task: Task, current_user: dict) -> bool:
    uid = current_user.get("sub")
    role = current_user.get("role")
    if role in ("SUPER_ADMIN", "GROUP_ADMIN"):
        return True
    if role == "HOSPITAL_ADMIN":
        hospital_id = current_user.get("hospital_id")
        if task.hospital_id and hospital_id and str(task.hospital_id) == str(hospital_id):
            return True
        return False
    return str(task.created_by) == uid or (task.assignee_id and str(task.assignee_id) == uid)


@router.get("/")
async def list_tasks(
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    assignee_id: Optional[str] = Query(None),
    view: Optional[str] = Query(None, description="today|overdue|upcoming|all"),
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    q = _visible_tasks_query(current_user)
    today_start, tomorrow = _day_bounds()
    if view == "today":
        q = q.where(
            Task.status != TaskStatus.DONE,
            Task.due_date.isnot(None),
            Task.due_date >= today_start,
            Task.due_date < tomorrow,
        )
    elif view == "overdue":
        q = q.where(
            Task.status != TaskStatus.DONE,
            Task.due_date.isnot(None),
            Task.due_date < today_start,
        )
    elif view == "upcoming":
        q = q.where(
            Task.status != TaskStatus.DONE,
            Task.due_date.isnot(None),
            Task.due_date >= today_start,
        )
    if status:
        q = q.where(Task.status == status)
    if priority:
        q = q.where(Task.priority == priority)
    if assignee_id:
        q = q.where(Task.assignee_id == assignee_id)
    if entity_type:
        q = q.where(Task.entity_type == entity_type)
    if entity_id:
        q = q.where(Task.entity_id == entity_id)
    if search:
        like = f"%{search.lower()}%"
        q = q.where(func.lower(Task.title).like(like))
    q = q.order_by(desc(Task.created_at)).offset(offset).limit(limit)
    rows = (await db.execute(q)).scalars().all()
    result = []
    for t in rows:
        assignee = await db.get(User, t.assignee_id) if t.assignee_id else None
        creator = await db.get(User, t.created_by)
        result.append(_task_to_dict(t, assignee, creator))
    return result


@router.get("/stats")
async def task_stats(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> TaskStats:
    rows = (await db.execute(_visible_tasks_query(current_user))).scalars().all()
    now = _now()
    today_start, tomorrow = _day_bounds()
    by_priority = {p: 0 for p in TaskPriority.ALL}
    open_count = 0
    in_progress = 0
    completed = 0
    overdue = 0
    due_today = 0
    upcoming = 0
    for t in rows:
        if t.priority in by_priority:
            by_priority[t.priority] += 1
        if t.status == TaskStatus.DONE:
            completed += 1
            continue
        if t.status == TaskStatus.IN_PROGRESS:
            in_progress += 1
        else:
            open_count += 1
        if t.due_date:
            if t.due_date < now:
                overdue += 1
            elif t.due_date < tomorrow:
                due_today += 1
            else:
                upcoming += 1
    return TaskStats(
        total=len(rows),
        open=open_count,
        in_progress=in_progress,
        completed=completed,
        overdue=overdue,
        due_today=due_today,
        upcoming=upcoming,
        by_priority=by_priority,
    )


@router.post("/")
async def create_task(
    data: TaskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    task = Task(
        title=data.title,
        description=data.description,
        due_date=data.due_date,
        priority=data.priority or TaskPriority.MEDIUM,
        status=data.status or TaskStatus.TODO,
        assignee_id=data.assignee_id,
        created_by=current_user.get("sub"),
        hospital_id=current_user.get("hospital_id"),
        entity_type=data.entity_type,
        entity_id=data.entity_id,
    )
    db.add(task)
    await db.flush()
    await db.commit()
    await db.refresh(task)
    creator = await db.get(User, task.created_by)
    return _task_to_dict(task, None, creator)


@router.get("/{task_id}")
async def get_task(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    task = await db.get(Task, task_id)
    if not task or not _can_manage(task, current_user):
        raise HTTPException(status_code=404, detail="Task not found")
    assignee = await db.get(User, task.assignee_id) if task.assignee_id else None
    creator = await db.get(User, task.created_by)
    return _task_to_dict(task, assignee, creator)


@router.put("/{task_id}")
async def update_task(
    task_id: str,
    data: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    task = await db.get(Task, task_id)
    if not task or not _can_manage(task, current_user):
        raise HTTPException(status_code=404, detail="Task not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(task, field, value)
    if data.status == TaskStatus.DONE and not task.completed_at:
        task.completed_at = _now()
    elif data.status and data.status != TaskStatus.DONE:
        task.completed_at = None
    task.updated_at = _now()
    await db.commit()
    await db.refresh(task)
    assignee = await db.get(User, task.assignee_id) if task.assignee_id else None
    creator = await db.get(User, task.created_by)
    return _task_to_dict(task, assignee, creator)


@router.patch("/{task_id}/status")
async def update_task_status(
    task_id: str,
    data: TaskStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    task = await db.get(Task, task_id)
    if not task or not _can_manage(task, current_user):
        raise HTTPException(status_code=404, detail="Task not found")
    task.status = data.status
    if data.status == TaskStatus.DONE:
        task.completed_at = _now()
    else:
        task.completed_at = None
    task.updated_at = _now()
    await db.commit()
    await db.refresh(task)
    assignee = await db.get(User, task.assignee_id) if task.assignee_id else None
    creator = await db.get(User, task.created_by)
    return _task_to_dict(task, assignee, creator)


@router.patch("/{task_id}/assignee")
async def update_task_assignee(
    task_id: str,
    data: TaskAssigneeUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    task = await db.get(Task, task_id)
    if not task or not _can_manage(task, current_user):
        raise HTTPException(status_code=404, detail="Task not found")
    task.assignee_id = data.assignee_id
    task.updated_at = _now()
    await db.commit()
    await db.refresh(task)
    assignee = await db.get(User, task.assignee_id) if task.assignee_id else None
    creator = await db.get(User, task.created_by)
    return _task_to_dict(task, assignee, creator)


@router.delete("/{task_id}")
async def delete_task(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    task = await db.get(Task, task_id)
    if not task or not _can_manage(task, current_user):
        raise HTTPException(status_code=404, detail="Task not found")
    await db.delete(task)
    await db.commit()
    return {"success": True}
