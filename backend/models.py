"""
Core data model.

Two tables, deliberately small right now:

Race        - one row per event. Even though today there's only Press Expedition 50,
              modeling this as its own table (instead of hardcoding) means every
              future Sommet race reuses this same backend without a schema change.

Registrant  - one row per signup. Status is the field the RD dashboard will act on:
              a registrant moves through pending_payment -> registered -> (optionally)
              waitlisted / transferred / refunded / dns / dq over their lifecycle.

Payment fields are stubbed (stripe_payment_intent_id, amount_paid_cents) so Stripe
can be wired in later without another migration.
"""

from datetime import datetime, date
from enum import Enum
from typing import Optional

from sqlmodel import SQLModel, Field


class RegistrantStatus(str, Enum):
    pending_payment = "pending_payment"
    registered = "registered"
    waitlisted = "waitlisted"
    transferred = "transferred"
    refunded = "refunded"
    dns = "dns"          # did not start
    dq = "dq"            # disqualified


class Race(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    slug: str = Field(index=True, unique=True)          # "press-expedition-50"
    name: str                                            # "Press Expedition 50"
    distance_miles: float
    race_date: date
    capacity: int
    price_cents: int
    is_registration_open: bool = Field(default=True)

    created_at: datetime = Field(default_factory=datetime.utcnow)


class Registrant(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    race_id: int = Field(foreign_key="race.id", index=True)

    first_name: str
    last_name: str
    email: str = Field(index=True)
    phone: str
    date_of_birth: Optional[date] = None

    emergency_contact_name: str
    emergency_contact_phone: str

    status: RegistrantStatus = Field(default=RegistrantStatus.pending_payment)
    bib_number: Optional[int] = Field(default=None, index=True)

    waiver_accepted: bool = Field(default=False)
    checked_in: bool = Field(default=False)

    tags: Optional[str] = None   # comma-separated for now (e.g. "volunteer,elite")
    notes: Optional[str] = None  # RD-only internal notes

    stripe_customer_id: Optional[str] = None
    stripe_payment_intent_id: Optional[str] = None
    amount_paid_cents: int = Field(default=0)

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
