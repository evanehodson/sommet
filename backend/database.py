"""
Database engine setup.

Local dev:   no DATABASE_URL set -> falls back to a local SQLite file
Production:  set DATABASE_URL to your Neon connection string, e.g.

  postgresql+psycopg://USER:PASSWORD@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require

Neon gives you this string directly from the dashboard (Connect > Connection string).
Just swap "postgresql://" for "postgresql+psycopg://" at the front so SQLModel
uses the psycopg driver.
"""

import os
from dotenv import load_dotenv
from sqlmodel import SQLModel, Session, create_engine
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./local_dev.db")

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, echo=False, connect_args=connect_args)


def init_db() -> None:
    """Create tables if they don't exist. Fine for now; move to Alembic migrations
    once the schema starts changing under real data (i.e. once you have live
    registrants you can't afford to drop)."""
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session