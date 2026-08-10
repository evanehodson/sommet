"""
Core data model.

Three tables:

Race        - one row per event. Even though today there's only Press Expedition 50,
              modeling this as its own table (instead of hardcoding) means every
              future Sommet race reuses this same backend without a schema change.

Registrant  - one row per signup. status is a *payment/later lifecycle* field
              only: how that person's slot gets handled. A registrant moves through
              pending_payment -> registered and (depending on what happens with their
              slot and money) waitlisted / transferred / refunded.

              When they line up on race day, their *result* status is a separate
              concern and lives on Result.outcome (did-not-finish/start/disq are
              race-day outcomes, not registration states -- see registrations.py
              docs on _seed). bib_number is assigned automatically at registration
              (see main.py's _assign_bib), not filled in later by an RD -- it's the
              runner's receipt, so it exists the moment they sign up. Waitlisted
              registrants don't get one until they're promoted to registered.

Result      - one row per registrant's *outcome* for a race. Two kinds:
                finish     (outcome=finished)  place + finish_time_seconds set,
                                              tied to a position on the board
                dnf/DNS/dq (outcome=dnf)      no place, no time; a public
                                              "did not finish" line on the results

              Deliberately thin: everything distinguishing the runner (name,
              distance, tags) is retrieved by joining to Registrant, not duplicated
              here. race_id is kept on Result too even though it's reachable via
              registrant.race_id, because the public results page queries "all
              results for this race" constantly on race day and shouldn't need a
              join through Registrant just to filter by race.

Payment fields are stubbed (stripe_payment_intent_id, amount_paid_cents) so Stripe
can be wired in later without another migration.
"""

from datetime import datetime, date
from enum import Enum
from typing import Optional
from sqlmodel import SQLModel, Field, UniqueConstraint


class RegistrantStatus(str, Enum):
    """Where a signup sits in the payment/registration lifecycle.
    """
    pending_payment = "pending_payment"
    registered = "registered"
    waitlisted = "waitlisted"
    refunded = "refunded"


class ResultOutcome(str, Enum):
    """How a registrant's race-day experience ended, as one tag on Result.

    dns / dnf / dq are folded into a single `dnf` bucket: with no timing chips
    in play (timer.py punches a FINISH button per runner), the system can't
    distinguish "never started" from "didn't finish" from "disqualified" - the
    only fact it measures is "bib never crossed the line". Finer distinctions
    can be scribbled in Registrant.notes, but they don't deserve schema space
    that the public results page will treat identically anyway.
    """
    finished = "finished"
    dnf = "dnf"


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
    # One outcome row per (race, registrant). place is populated only for
    # finishers, and (race_id, place) is what makes /results/import safe to
    # re-run: place is fixed by the finish-line order, so re-syncing the same
    # sheet (or correcting a typo'd bib) overwrites that position's row in
    # place instead of stacking a duplicate finisher. Non-finishers have no
    # place, so they're uniqued per registrant instead (uq_result_race_registrant).
    __table_args__ = (
        UniqueConstraint("race_id", "place", name="uq_result_race_place"),
        UniqueConstraint("race_id", "registrant_id", name="uq_result_race_registrant"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    race_id: int = Field(foreign_key="race.id", index=True)
    registrant_id: int = Field(foreign_key="registrant.id", index=True)

    outcome: ResultOutcome = Field(default=ResultOutcome.finished)
    place: Optional[int] = Field(default=None)              # null for anything except finished
    finish_time_seconds: Optional[float] = Field(default=None)  # null for anything except finished

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)