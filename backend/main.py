import os
from contextlib import asynccontextmanager
from datetime import datetime, date
from typing import List

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select, func

from database import get_session, init_db, engine
from models import Race, Registrant, RegistrantStatus, Result
from schemas import (
    RegistrationRequest,
    RegistrationResponse,
    RaceInfoResponse,
    RegistrantAdminView,
    ResultImportRequest,
    ResultImportResponse,
    ResultPublicView,
)

# Temporary shared-secret auth for the admin endpoint until real RD accounts
# exist. Set ADMIN_API_KEY in your environment; requests must send it as
# X-Admin-Key. Swap this for per-RD login as soon as the dashboard needs it.
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY", "dev-only-change-me")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    _seed_press_expedition_50()
    yield


app = FastAPI(title="Sommet Registration API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    # Lock this down to your actual domain(s) before going live.
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


def _seed_press_expedition_50():
    """Creates the one race we currently have if it doesn't exist yet.
    Once there's a real RD dashboard, race creation moves there instead."""
    with Session(engine) as session:
        existing = session.exec(select(Race).where(Race.slug == "press-expedition-50")).first()
        if existing:
            return
        race = Race(
            slug="press-expedition-50",
            name="Press Expedition 50",
            distance_miles=48.8,
            race_date=date(2026, 8, 8),
            capacity=200,
            price_cents=15000,
            is_registration_open=True,
        )
        session.add(race)
        session.commit()


def require_admin(x_admin_key: str = Header(default="")):
    if x_admin_key != ADMIN_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing admin key.")


STARTING_BIB_NUMBER = 100  # arbitrary; low bibs (1-99) left open for elites/VIPs assigned by hand later


def _assign_bib(session: Session, race_id: int) -> int:
    """Next sequential bib for this race. Scoped per-race, not global, so two
    races can both have a #100. Only called for actual entrants, not the
    waitlist -- a waitlisted person isn't confirmed to run yet."""
    highest = session.exec(
        select(func.max(Registrant.bib_number)).where(Registrant.race_id == race_id)
    ).one()
    return (highest or STARTING_BIB_NUMBER - 1) + 1


def _spots_taken(session: Session, race_id: int) -> int:
    result = session.exec(
        select(func.count(Registrant.id)).where(
            Registrant.race_id == race_id,
            Registrant.status.in_([RegistrantStatus.pending_payment, RegistrantStatus.registered]),
        )
    ).one()
    return result


@app.get("/api/races/{slug}", response_model=RaceInfoResponse)
def get_race(slug: str, session: Session = Depends(get_session)):
    race = session.exec(select(Race).where(Race.slug == slug)).first()
    if not race:
        raise HTTPException(status_code=404, detail="Race not found.")
    taken = _spots_taken(session, race.id)
    return RaceInfoResponse(
        slug=race.slug,
        name=race.name,
        distance_miles=race.distance_miles,
        race_date=race.race_date,
        capacity=race.capacity,
        spots_taken=taken,
        spots_remaining=max(0, race.capacity - taken),
        is_registration_open=race.is_registration_open,
        price_cents=race.price_cents,
    )


@app.post("/api/races/{slug}/register", response_model=RegistrationResponse)
def register(slug: str, payload: RegistrationRequest, session: Session = Depends(get_session)):
    race = session.exec(select(Race).where(Race.slug == slug)).first()
    if not race:
        raise HTTPException(status_code=404, detail="Race not found.")
    if not race.is_registration_open:
        raise HTTPException(status_code=400, detail="Registration is closed for this race.")

    duplicate = session.exec(
        select(Registrant).where(Registrant.race_id == race.id, Registrant.email == payload.email)
    ).first()
    if duplicate:
        raise HTTPException(
            status_code=409,
            detail="This email is already registered for this race. Contact us if you need to make changes.",
        )

    taken = _spots_taken(session, race.id)
    status = RegistrantStatus.pending_payment if taken < race.capacity else RegistrantStatus.waitlisted

    # Bib is the runner's receipt -- assigned immediately, not left blank for
    # an RD to fill in later. Waitlisted entrants don't get one until they're
    # promoted, since they're not confirmed to run yet.
    bib_number = _assign_bib(session, race.id) if status != RegistrantStatus.waitlisted else None

    registrant = Registrant(
        race_id=race.id,
        first_name=payload.first_name,
        last_name=payload.last_name,
        email=payload.email,
        phone=payload.phone,
        date_of_birth=payload.date_of_birth,
        emergency_contact_name=payload.emergency_contact_name,
        emergency_contact_phone=payload.emergency_contact_phone,
        waiver_accepted=payload.waiver_accepted,
        status=status,
        bib_number=bib_number,
    )
    session.add(registrant)
    session.commit()
    session.refresh(registrant)

    # NOTE: this is where a Stripe PaymentIntent gets created next, with a
    # webhook flipping status pending_payment -> registered on success.
    # Skipped for this pass since it's not wired up yet.

    if status == RegistrantStatus.waitlisted:
        message = "The race is full. You've been added to the waitlist and we'll email you if a spot opens."
    else:
        message = f"You're in — bib #{bib_number}. Confirmation and payment details are on their way to your email."

    return RegistrationResponse(
        id=registrant.id, bib_number=registrant.bib_number, status=registrant.status, message=message
    )


@app.get(
    "/api/races/{slug}/registrants",
    response_model=List[RegistrantAdminView],
    dependencies=[Depends(require_admin)],
)
def list_registrants(slug: str, session: Session = Depends(get_session)):
    """Placeholder for the RD dashboard. Protected by a shared admin key for now."""
    race = session.exec(select(Race).where(Race.slug == slug)).first()
    if not race:
        raise HTTPException(status_code=404, detail="Race not found.")
    registrants = session.exec(select(Registrant).where(Registrant.race_id == race.id)).all()
    return registrants


@app.post(
    "/api/races/{slug}/results/import",
    response_model=ResultImportResponse,
    dependencies=[Depends(require_admin)],
)
def import_results(slug: str, payload: ResultImportRequest, session: Session = Depends(get_session)):
    """Called by sync_results.py after person 2 has filled in bibs on the
    Sheet. Matches each row to a Registrant by (race_id, bib_number). Rows
    that don't match anyone are reported back, not silently dropped --
    a typo'd bib should surface as something to check, not vanish.

    Results are upserted by (race_id, place): place is fixed by finish order,
    so re-running the sync (or fixing a corrected bib on a second pass)
    overwrites that position's row in place instead of stacking a duplicate."""
    race = session.exec(select(Race).where(Race.slug == slug)).first()
    if not race:
        raise HTTPException(status_code=404, detail="Race not found.")

    imported = 0
    unmatched: List[int] = []

    for row in payload.results:
        registrant = session.exec(
            select(Registrant).where(
                Registrant.race_id == race.id, Registrant.bib_number == row.bib_number
            )
        ).first()
        if not registrant:
            unmatched.append(row.bib_number)
            continue

        # Upsert on (race_id, place): correct a typo'd bib by overwriting the
        # place's row with the right registrant, not by stacking another one.
        existing = session.exec(
            select(Result).where(Result.race_id == race.id, Result.place == row.place)
        ).first()

        if existing:
            existing.registrant_id = registrant.id
            existing.finish_time_seconds = row.finish_time_seconds
            existing.updated_at = datetime.utcnow()
            session.add(existing)
        else:
            session.add(
                Result(
                    race_id=race.id,
                    registrant_id=registrant.id,
                    place=row.place,
                    finish_time_seconds=row.finish_time_seconds,
                )
            )
        imported += 1

    session.commit()
    return ResultImportResponse(imported=imported, unmatched_bibs=unmatched)


@app.get("/api/races/{slug}/results", response_model=List[ResultPublicView])
def get_results(slug: str, session: Session = Depends(get_session)):
    race = session.exec(select(Race).where(Race.slug == slug)).first()
    if not race:
        raise HTTPException(status_code=404, detail="Race not found.")

    rows = session.exec(
        select(Result, Registrant)
        .where(Result.race_id == race.id, Result.registrant_id == Registrant.id)
        .order_by(Result.place)
    ).all()

    return [
        ResultPublicView(
            place=result.place,
            bib_number=registrant.bib_number,
            first_name=registrant.first_name,
            last_name=registrant.last_name,
            finish_time_seconds=result.finish_time_seconds,
        )
        for result, registrant in rows
    ]


@app.get("/api/health")
def health():
    return {"status": "ok", "time": datetime.utcnow().isoformat()}