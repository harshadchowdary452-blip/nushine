"""Standard CRM API response schemas."""
from __future__ import annotations
from typing import Any, Generic, Optional, TypeVar
from pydantic import BaseModel

T = TypeVar("T")


class APIResponse(BaseModel, Generic[T]):
    """Standard API response envelope."""
    success: bool = True
    message: Optional[str] = None
    data: Optional[T] = None
    errors: Optional[list[dict[str, Any]]] = None


class PaginatedResponse(BaseModel, Generic[T]):
    """Standard paginated API response."""
    success: bool = True
    message: Optional[str] = None
    data: Optional[list[T]] = None
    total: int = 0
    page: int = 1
    page_size: int = 20
    pages: int = 0
    errors: Optional[list[dict[str, Any]]] = None


class ErrorResponse(BaseModel):
    """Standard error response."""
    success: bool = False
    message: str
    errors: Optional[list[dict[str, Any]]] = None


def success_response(data: Any = None, message: str = "Success") -> dict:
    """Create a standard success response dict."""
    return {"success": True, "message": message, "data": data, "errors": None}


def error_response(message: str, errors: list = None) -> dict:
    """Create a standard error response dict."""
    return {"success": False, "message": message, "data": None, "errors": errors}


def paginated_response(
    data: list, total: int, page: int, page_size: int, message: str = "Success"
) -> dict:
    """Create a standard paginated response dict."""
    pages = (total + page_size - 1) // page_size if page_size > 0 else 0
    return {
        "success": True,
        "message": message,
        "data": data,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": pages,
        "errors": None,
    }
