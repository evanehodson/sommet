from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, field_validator, model_validator

from models import RegistrantStatus, ResultOutcome


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
    bib_number: Optional[int]
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


class ResultRow(BaseModel):
    """One row as it comes off the timer sheet after person 2 fills in bibs.
    bib_number is how we match it to a Registrant -- it's not stored on
    Result itself, only registrant_id is, once the match succeeds.

    A finisher carries place + finish_time_seconds. A non-finisher (outcome=dnf)
    has neither, so both are optional here -- they only matter when finished.
    """
    bib_number: int
    outcome: ResultOutcome = ResultOutcome.finished
    place: Optional[int] = None
    finish_time_seconds: Optional[float] = None

    @model_validator(mode="after")
    def finished_rows_need_place_and_time(self):
        if self.outcome == ResultOutcome.finished:
            if self.place is None or self.finish_time_seconds is None:
                raise ValueError("Finished rows need both place and finish_time_seconds.")
        else:
            if self.place is not None or self.finish_time_seconds is not None:
                raise ValueError("Non-finisher rows shouldn't carry a place or finish time.")
        return self


class ResultImportRequest(BaseModel):
    results: List[ResultRow]


class ResultImportResponse(BaseModel):
    imported: int
    unmatched_bibs: List[int]


class ResultPublicView(BaseModel):
    outcome: ResultOutcome
    place: Optional[int]          # null for the dnf bucket
    bib_number: int
    first_name: str
    last_name: str
    finish_time_seconds: Optional[float] = None