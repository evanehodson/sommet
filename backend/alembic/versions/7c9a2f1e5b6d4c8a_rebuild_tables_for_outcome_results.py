"""rebuild tables for outcome-aware results

Rebuilds race / registrant / result around the corrected taxonomy:

  * Registrant.status is now lifecycle-only (pending_payment, registered,
    waitlisted, transferred, refunded). The dns / dq values are gone.
  * Result gains an `outcome` column (finished / dnf) and its place and
    finish_time_seconds become nullable -- a non-finisher is one row with
    outcome=dnf and no place/time, instead of a schema-level impossibility.

Reasons this is a drop-and-recreate instead of piecemeal ALTERs: enum-valued
columns on Postgres are their own types, so removing enum members (dns/dq) or
widening a unique constraint spans table remake territory, and there is no
real data yet to preserve. When live results exist, this becomes real
migrations instead of rebuilds.

Revision ID: 7c9a2f1e5b6d4c8a
Revises: 3886b07fd98c
Create Date: 2026-08-08 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

from models import SQLModel


# revision identifiers, used by Alembic.
revision: str = '7c9a2f1e5b6d4c8a'
down_revision: Union[str, Sequence[str], None] = '3886b07fd98c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Drop everything and recreate from models.py.

    A clean teardown: results and registrants reference races, so drop in
    dependency order before recreating. create_all is idempotent, so init_db()
    at app startup will be a no-op against the freshly minted schema."""
    bind = op.get_bind()
    for table in ("result", "registrant", "race"):
        op.execute(f"DROP TABLE IF EXISTS {table}")
    SQLModel.metadata.create_all(bind)


def downgrade() -> None:
    """Rolling back a rebuild has no original rows to restore.

    There was never data worth returning to (that's the point of a rebuild),
    so rollback just tears the new tables back down. If you need the pre-outcome
    schema from this point, it still exists as the older baseline revisions
    (c44eb758e88d), which can be applied to a fresh database."""
    for table in ("result", "registrant", "race"):
        op.execute(f"DROP TABLE IF EXISTS {table}")