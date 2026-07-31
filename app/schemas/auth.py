from pydantic import BaseModel, Field
from typing import Optional


class LoginRequest(BaseModel):
    email: str = Field(..., max_length=255)
    password: str = Field(..., min_length=6)


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str


class UpdateProfileRequest(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=255)
    phone: Optional[str] = None
    specialization: Optional[str] = None
    license_number: Optional[str] = None


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str
    user: dict


class ContextSwitchRequest(BaseModel):
    hospital_id: Optional[str] = None


class ContextSwitchResponse(BaseModel):
    scope: str
    hospital_id: Optional[str] = None
    hospital_name: Optional[str] = None
    admin_group_id: Optional[str] = None
    admin_group_name: Optional[str] = None
