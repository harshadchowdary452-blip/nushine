"""Centralized CRM error handling."""
from fastapi import HTTPException, status


class CRMError(HTTPException):
    """Base CRM error."""
    def __init__(self, detail: str, status_code: int = 400):
        super().__init__(status_code=status_code, detail=detail)


class CRMNotFoundError(CRMError):
    """Entity not found."""
    def __init__(self, entity: str = "Resource", entity_id: str = ""):
        detail = f"{entity} not found" + (f": {entity_id}" if entity_id else "")
        super().__init__(detail=detail, status_code=status.HTTP_404_NOT_FOUND)


class CRMAccessDeniedError(CRMError):
    """Access denied."""
    def __init__(self, detail: str = "Access denied"):
        super().__init__(detail=detail, status_code=status.HTTP_403_FORBIDDEN)


class CRMValidationError(CRMError):
    """Validation error."""
    def __init__(self, detail: str):
        super().__init__(detail=detail, status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)


class CRMBusinessError(CRMError):
    """Business logic error (e.g., invalid state transition)."""
    def __init__(self, detail: str):
        super().__init__(detail=detail, status_code=status.HTTP_400_BAD_REQUEST)
