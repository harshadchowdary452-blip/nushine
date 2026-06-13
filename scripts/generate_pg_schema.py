"""
Generate PostgreSQL schema SQL from SQLAlchemy models.
Output: scripts/postgresql_schema.sql

Usage: python scripts/generate_pg_schema.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import os
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./dental_hospital.db"
os.environ["DATABASE_URL_SYNC"] = "sqlite:///./dental_hospital.db"

from app.database import Base
from app.models import *
from sqlalchemy.schema import CreateTable
from sqlalchemy.dialects import postgresql


def main():
    output_path = Path(__file__).resolve().parent / "postgresql_schema.sql"
    statements = []

    # Enum types
    enums = set()
    for table in Base.metadata.sorted_tables:
        for column in table.columns:
            if hasattr(column.type, 'enums') and column.type.enums:
                enum_name = f"{column.table.name}_{column.name}_enum".upper()
                if enum_name not in enums:
                    enums.add(enum_name)
                    values = ", ".join(f"'{v}'" for v in column.type.enums)
                    statements.append(f"CREATE TYPE {enum_name} AS ENUM ({values});")

    # Tables
    for table in reversed(Base.metadata.sorted_tables):
        create_sql = str(CreateTable(table).compile(dialect=postgresql.dialect())).strip()
        statements.append(create_sql + ";")

    # Indexes
    for table in Base.metadata.sorted_tables:
        for index in table.indexes:
            cols = ", ".join(c.name for c in index.columns)
            unique = "UNIQUE " if index.unique else ""
            stmt = f"CREATE {unique}INDEX IF NOT EXISTS {index.name} ON {table.name} ({cols});"
            statements.append(stmt)

    output_path.write_text("\n\n".join(statements) + "\n")
    print(f"Schema SQL written to: {output_path}")
    print(f"Total statements: {len(statements)}")


if __name__ == "__main__":
    main()
