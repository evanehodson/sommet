# Sommet Registration API

The one shared backend service for all Sommet race sites. FastAPI + SQLModel
with a Postgres backend in production and a local SQLite fallback in dev.

## Layout

```
models.py       SQLModel tables: Race, Registrant, Result
schemas.py      request/response models (pydantic)
database.py     engine + session setup
alembic/        DB migrations (alembic)
requirements.txt
.env.example    copy to .env and fill in
```

## Run locally

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate      # Windows
pip install -r requirements.txt
copy .env.example .env      # Windows (cp on macOS/Linux)
uvicorn main:app --reload
```

With no `DATABASE_URL` set, the API uses `local_dev.db` (SQLite). Point
`DATABASE_URL` at Neon Postgres for real data (see `.env.example`).

## Migrations (Alembic)

Schema changes go through Alembic, not `create_all`. `init_db()` still runs
`create_all` on startup for brand-new dev SQLite, but it never alters existing
tables — so any model change must ship as a migration:

```bash
cd backend
alembic revision --autogenerate -m "describe change"   # draft a migration
alembic upgrade head                                     # apply it (local or prod via DATABASE_URL)
```

## Endpoints

| Method | Path                          | Auth      | Purpose                        |
|--------|-------------------------------|-----------|--------------------------------|
| GET    | /api/races/{slug}             | public    | Race info, price, spots free   |
| POST   | /api/races/{slug}/register    | public    | Register a runner              |
| GET    | /api/races/{slug}/registrants | X-Admin-Key | RD dashboard registry (WIP)  |
| POST   | /api/races/{slug}/results/import | X-Admin-Key | Upsert finish results by place (from sync_results.py) |
| GET    | /api/races/{slug}/results     | public    | Published results, ordered by place |
| GET    | /api/health                   | public    | Health check                   |

## Client wiring

Each site ships a `config.js` exposing `window.SOMMET_API_BASE` (and
`window.SOMMET_RACE_SLUG`). `sites/press-expedition-50/register.*` posts to
that base and slug, so deploy-time you only rewrite the base URL.

> Note: the database seeds Press Expedition 50 automatically on startup, since
> it's currently the only race and there's no RD dashboard yet. When a real
> dashboard exists, race creation moves there.