# Employee Attendance System

Face recognition based employee attendance system — React.js + Python FastAPI + PostgreSQL + Docker.

---

## Prerequisites

Install these two things only:

- **Docker Desktop** → https://www.docker.com/products/docker-desktop/
- **Git** (optional) → https://git-scm.com/

That's it. No Python, no Node.js, no PostgreSQL installation needed on your machine.

---

## Run the entire project — 2 commands

```powershell
cd "D:\Kuntal\Project 3\attendance-system\attendance-system"
docker compose up --build
```

Docker will automatically:
- Pull Python 3.11, Node 18, PostgreSQL 16 with pgvector, Redis
- Install all dependencies inside containers
- Start all 4 services together

Wait for this message:
```
attendance_backend  | INFO: Application startup complete.
```

---

## Create admin user (run once after first launch)

Open a new PowerShell window:

```powershell
docker exec attendance_backend python seed.py
```

Output:
```
✅ Seed complete!
   Admin login  → admin@company.com / admin123
   HR login     → hr@company.com / hr123
```

---

## Open the app

| Service | URL |
|---|---|
| Frontend (React) | http://localhost |
| Backend API | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |

---

## Default logins

| Role | Email | Password |
|---|---|---|
| Admin | admin@company.com | admin123 |
| HR | hr@company.com | hr123 |

---

## Daily usage

```powershell
# Start all services
docker compose up

# Stop all services
docker compose down

# Stop and delete all data (fresh start)
docker compose down -v

# View logs
docker compose logs -f backend

# Rebuild after code changes
docker compose up --build
```

---

## Services started by Docker

| Container | What it runs | Port |
|---|---|---|
| attendance_db | PostgreSQL 16 + pgvector | 5432 |
| attendance_redis | Redis 7 | 6379 |
| attendance_backend | Python 3.11 + FastAPI | 8000 |
| attendance_frontend | React built + Nginx | 80 |

---

## Project Structure

```
attendance-system/
├── docker-compose.yml         ← Orchestrates all 4 services
├── init.sql                   ← Enables pgvector on DB startup
│
├── backend/
│   ├── Dockerfile             ← Python 3.11 container
│   ├── requirements.txt
│   ├── seed.py                ← Creates admin user + default data
│   └── app/
│       ├── main.py
│       ├── core/              ← config, database, security
│       ├── models/            ← SQLAlchemy models
│       ├── schemas/           ← Pydantic schemas
│       ├── routes/            ← API endpoints
│       └── services/          ← Face recognition pipeline
│
└── frontend/
    ├── Dockerfile             ← Node 18 build + Nginx serve
    ├── nginx.conf             ← Reverse proxy + SPA routing
    └── src/
        ├── App.jsx
        ├── pages/             ← Dashboard, LiveCheckin, Employees...
        ├── components/
        ├── api/               ← Axios client
        └── context/           ← Auth context
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | /api/auth/login | Login |
| GET | /api/auth/me | Current user |
| GET | /api/employees/ | List employees |
| POST | /api/employees/ | Create employee |
| POST | /api/attendance/face/register/{id} | Register face |
| POST | /api/attendance/face/recognize | Face check-in |
| GET | /api/attendance/today | Today's logs |
| GET | /api/attendance/logs | Filtered logs |
| GET | /api/attendance/dashboard | Stats |
| POST | /api/attendance/manual | Manual mark |
| POST | /api/leave/apply | Apply leave |
| PATCH | /api/leave/{id}/review | Approve/reject |
| GET | /api/departments/ | Departments |
| GET | /api/shifts/ | Shifts |
