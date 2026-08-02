# Dental Hospital Management System

Multi-Tenant SaaS Platform for Dental Hospitals built with FastAPI, PostgreSQL, SQLAlchemy 2.0, JWT Authentication, and Clean Architecture.

## System Hierarchy
```
SUPER_ADMIN → GROUP_ADMIN → HOSPITAL_ADMIN → DOCTOR → PATIENT
```

## Tech Stack
- FastAPI + SQLAlchemy 2.0 (async)
- PostgreSQL 16 + Alembic
- JWT Auth (access + refresh tokens with rotation)
- RBAC with granular permissions
- Docker Compose deployment
- WhatsApp automation (Twilio/Meta)

## Quick Start
```bash
# Provide production secrets (required by docker-compose; see app/config.py)
#   SECRET_KEY=$(python -c "import secrets;print(secrets.token_urlsafe(48))")
#   SUPER_ADMIN_PASSWORD=<strong-password>
SECRET_KEY=<...> SUPER_ADMIN_PASSWORD=<...> docker-compose up -d
# API: http://localhost:8000
# Swagger: http://localhost:8000/docs
# Super Admin: {SUPER_ADMIN_EMAIL:-superadmin@dental.com} / $SUPER_ADMIN_PASSWORD
```

## API Endpoints (prefix: /api/v1)
- Auth: login, refresh, logout, change-password
- Admin Groups: CRUD
- Hospitals: CRUD + create hospital admin
- Doctors: CRUD + activate/deactivate
- Consultants: CRUD
- Patients: CRUD + search + photo upload
- Cases: CRUD + assign consultant + complete
- Consultant Notes: create, get by case
- Treatment Plans: CRUD
- Treatment Sittings: CRUD
- Appointments: CRUD + upcoming + cancel
- Billings: create, get by case, update payment
- Pre-Op: create with file uploads
- Post-Op: create with file uploads
- Dashboards: super-admin, group-admin, hospital-admin, doctor

## Project Structure
```
app/core/        - JWT, security, permissions
app/models/      - 15 SQLAlchemy models
app/schemas/     - Pydantic schemas
app/repositories - Data access layer
app/services/    - Business logic
app/routers/     - API endpoints
app/utils/       - WhatsApp, scheduler
alembic/         - Migrations
tests/           - pytest tests
```
