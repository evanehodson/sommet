import os
from datetime import datetime, date
from typing import List

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select, func

from database import get_session, init_db, engine
from models import Race, Registrant, RegistrantStatus
from schemas import (
    RegistrationRequest,
    RegistrationResponse,
    RaceInfoResponse,
    RegistrantAdminView,
)

# Temporary shared-secret auth for the admin endpoint until real RD accounts
# exist. Set ADMIN_API_KEY in your environment; requests must send it as
# X-Admin-Key. Swap this for per-RD login as soon as the dashboard needs it.
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY", "dev-only-change-me")

app = FastAPI(title="Sommet Registration API")

app.add_middleware(
    CORSMiddleware,
    # Lock this down to your actual domain(s) before going live.
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()
    _seed_press_expedition_50()


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
        message = "You're in. Confirmation and payment details are on their way to your email."

    return RegistrationResponse(id=registrant.id, status=registrant.status, message=message)


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


@app.get("/api/health")
def health():
    return {"status": "ok", "time": datetime.utcnow().isoformat()}
