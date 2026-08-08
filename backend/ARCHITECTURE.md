# Backend architecture

The shared FastAPI registration service that every Sommet race site talks to.
This doc is the companion to the code: read the chunked walkthrough here, then
open `models.py`, `schemas.py`, and `main.py` beside it.

## Where this sits in the whole repo

```
┌────────────────────────  the one shared backend  ────────────────────────┐
│  sites/press-expedition-50/register.js  ──POST /register──►  FastAPI      │
│  demos/ins_live_map (live model)        ──WebSocket───────►  (unchanged)  │
│  timing/sync_results.py  ───POST /results/import───►   ┌──────────────┐   │
│  portfolio gallery (iframes race sites)               │ SQLModel +   │   │
│                                                        │ Postgres dev │   │
│                                                        └──────────────┘   │
└───────────────────────────────────────────────────────────────────────────┘
```

FastAPI is stateless: every request opens its own session (see `database.get_session`).
The tables and the flow around them are the architecture.

## The three tables and why they're shaped that way

**Race** - one row per event. Even though there's currently exactly one race
(Press Expedition 50, auto-seeded in `main._seed_press_expedition_50`), it's a
row, not a constant — so every future Sommet race reuses this backend with zero
schema change. `slug` is the public identifier every URL keys on.

**Registrant** - one row per signup.

| | Registrant lives / lives-out-of here |
|---|---|
| `status` | the *payment/registration lifecycle* only |
| `PRETTY bib_number` | `main._assign_bib` hands it out at signup — it's the runner's receipt, never filled in later by an RD |
| payment fields | stubbed (`stripe_*`, `amount_paid_*`) for the future Stripe webhook |

**Result** - one row per runner's *outcome* (`finished` or `dnf`).

A `Result` row is deliberately thin: place and time (finishers only), plus a link
to the registrant. Race-day outcome tags (`dnf` = did not finish, covering
dns/dq/dnf for now) live here, **not** on `Registrant.status` — status is
registration lifecycle; outcome is race outcome. Two separate concerns, two
fields.

### Why Registrant.status and Result.outcome are different things

`Registrant.status`, not `Result.outcome`, answers "is this person confirmed,
waitlisted, refunded…?" — stuff the RD dashboard and payment webhook flip.
`Result.outcome` answers "did this bib cross the line?" — an event on race day.

A runner can be `registered` and still have a `dnf` Result. Enums are not the
same axis.

## The main.py endpoints, in data-flow order

| Endpoint | Reads | Writes | Notes |
|---|---|---|---|
| `GET /api/races/{slug}` | `Race` | — | public race info, price, spots |
| `POST /api/races/{slug}/register` | `Race`, `Registrant` | `Registrant` | dedupe by email, assign bib if spots left, else waitlist |
| `GET /api/races/{slug}/registrants` | `Registrant` | — | admin-key-only (WIP dashboard) |
| `POST /api/races/{slug}/results/import` | `Registrant` | `Result` | upserts results (finishers by place, DNFs by registrant) |
| `GET /api/races/{slug}/results` | `Result`, `Registrant` | — | public: finishers by place, then DNF bucket |

Flow: register → DB row appears → results/import maps a finisher's bib to a
registrant → results page reads it joined back out for display.

## How to extend this doc

As you annotate and rewrite chunks of the backend (models → register →
results/import), drop each one's write-up here, right after the relevant section.
Keep it connective: how the piece reaches the surrounding tables and endpoints,
not a line-by-line repeat of the code.