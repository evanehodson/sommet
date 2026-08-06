from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, field_validator

from models import RegistrantStatus


class RegistrationRequest(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    phone: str
    date_of_birth: Optional[date] = None
    emergency_contact_name: str
    emergency_contact_phone: str
    waiver_accepted: bool

    @field_validator("first_name", "last_name", "phone", "emergency_contact_name", "emergency_contact_phone")
    @classmethod
    def not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("This field can't be blank.")
        return v

    @field_validator("waiver_accepted")
    @classmethod
    def must_accept_waiver(cls, v: bool) -> bool:
        if not v:
            raise ValueError("You must accept the waiver to register.")
        return v


class RegistrationResponse(BaseModel):
    id: int
    status: RegistrantStatus
    message: str


class RaceInfoResponse(BaseModel):
    slug: str
    name: str
    distance_miles: float
    race_date: date
    capacity: int
    spots_taken: int
    spots_remaining: int
    is_registration_open: bool
    price_cents: int


class RegistrantAdminView(BaseModel):
    id: int
    first_name: str
    last_name: str
    email: str
    phone: str
    status: RegistrantStatus
    bib_number: Optional[int]
    checked_in: bool
    tags: Optional[str]
    created_at: datetime
