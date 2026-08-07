"""add result updated_at and unique place constraint

Revision ID: 3886b07fd98c
Revises: c44eb758e88d
Create Date: 2026-08-07 21:01:49.180352

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3886b07fd98c'
down_revision: Union[str, Sequence[str], None] = 'c44eb758e88d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(bind, table, column) -> bool:
    if bind.dialect.name == "postgresql":
        return (
            bind.execute(
                sa.text(
                    "SELECT 1 FROM information_schema.columns "
                    "WHERE table_name=:t AND column_name=:c"
                ),
                {"t": table, "c": column},
            ).first()
            is not None
        )
    rows = bind.execute(sa.text(f"PRAGMA table_info({table})")).fetchall()
    return any(r[1] == column for r in rows)


def _has_constraint(bind, table, name) -> bool:
    if bind.dialect.name == "postgresql":
        return (
            bind.execute(
sa.text(
                "SELECT 1 FROM pg_constraint WHERE conname=:n AND conrelid=to_regclass(:t)"
            ),
                {"n": name, "t": table},
            ).first()
            is not None
        )
    return (
        bind.execute(
            sa.text("SELECT 1 FROM sqlite_master WHERE tbl_name=:t AND name=:n"),
            {"t": table, "n": name},
        ).first()
        is not None
    )


def upgrade() -> None:
    """Add result.updated_at and uq_result_race_place to the existing result
    table. Guarded + idempotent so it only acts on tables that predate these
    migrations; fresh databases get both from the baseline (rev1) and skip."""
    bind = op.get_bind()

    if not _has_column(bind, "result", "updated_at"):
        if bind.dialect.name == "postgresql":
            # NOT NULL on an empty table; server_default keeps it valid even if
            # rows exist, then we drop it to match the model (created_at parity).
            op.add_column(
                "result",
                sa.Column(
                    "updated_at", sa.DateTime(), nullable=False,
                    server_default=sa.text("CURRENT_TIMESTAMP"),
                ),
            )
            op.alter_column("result", "updated_at", server_default=None)
        else:
            op.add_column(
                "result", sa.Column("updated_at", sa.DateTime(), nullable=False)
            )

    if not _has_constraint(bind, "result", "uq_result_race_place"):
        if bind.dialect.name == "postgresql":
            op.execute(
                "DO $do$ "
                "BEGIN "
                "IF NOT EXISTS (SELECT 1 FROM pg_constraint "
                "WHERE conname = 'uq_result_race_place' "
                "AND conrelid = 'result'::regclass) THEN "
                "ALTER TABLE result ADD CONSTRAINT uq_result_race_place "
                "UNIQUE (race_id, place); END IF; "
                "END $do$"
            )
        else:
            with op.batch_alter_table("result") as b:
                b.create_unique_constraint("uq_result_race_place", ["race_id", "place"])


def downgrade() -> None:
    """Remove the unique constraint and updated_at column added by upgrade()."""
    bind = op.get_bind()
    if _has_constraint(bind, "result", "uq_result_race_place"):
        if bind.dialect.name == "postgresql":
            op.execute("ALTER TABLE result DROP CONSTRAINT uq_result_race_place")
        else:
            with op.batch_alter_table("result") as b:
                b.drop_constraint("uq_result_race_place", type_="unique")
    if _has_column(bind, "result", "updated_at"):
        op.drop_column("result", "updated_at")
