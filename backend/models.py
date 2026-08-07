"""
Core data model.

Three tables:

Race        - one row per event. Even though today there's only Press Expedition 50,
              modeling this as its own table (instead of hardcoding) means every
              future Sommet race reuses this same backend without a schema change.

Registrant  - one row per signup. Status is the field the RD dashboard will act on:
              a registrant moves through pending_payment -> registered -> (optionally)
              waitlisted / transferred / refunded / dns / dq over their lifecycle.
              bib_number is assigned automatically at registration (see main.py's
              _assign_bib), not filled in later by an RD -- it's the runner's
              receipt, so it exists the moment they sign up. Waitlisted registrants
              don't get one until they're promoted to registered.

Result      - one row per finish. Deliberately thin: place, finish time, and a link
              back to the registrant it belongs to. Everything else about that
              runner (name, distance, tags) is retrieved by joining to Registrant,
              not duplicated here. race_id is kept on Result too even though it's
              reachable via registrant.race_id, because the public results page
              queries "all results for this race" constantly on race day and
              shouldn't need a join through Registrant just to filter by race.

Payment fields are stubbed (stripe_payment_intent_id, amount_paid_cents) so Stripe
can be wired in later without another migration.
"""

from datetime import datetime, date
from enum import Enum
from typing import Optional

from sqlmodel import SQLModel, Field, UniqueConstraint


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
    __table_args__ = (UniqueConstraint("race_id", "bib_number", name="uq_registrant_race_bib"),)

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


class Result(SQLModel, table=True):
    # One finish per position per race. This is what makes /results/import
    # safe to re-run: place is fixed by the finish-line order, so re-syncing
    # the same sheet (or correcting a typo'd bib) overwrites that position's
    # row in place instead of stacking a duplicate finisher.
    __table_args__ = (UniqueConstraint("race_id", "place", name="uq_result_race_place"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    race_id: int = Field(foreign_key="race.id", index=True)
    registrant_id: int = Field(foreign_key="registrant.id", index=True)

    place: int
    finish_time_seconds: float

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)