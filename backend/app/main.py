from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.database import init_db
from app.routes.auth import router as auth_router
from app.routes.employees import router as emp_router
from app.routes.attendance import router as att_router
from app.routes.leave import leave_router, dept_router, shift_router
from app.routes.settings import router as settings_router
from app.routes.reports import router as reports_router
from app.routes.payroll import router as payroll_router
from app.scheduler import start_scheduler


app = FastAPI(title="AttendPro API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(emp_router)
app.include_router(att_router)
app.include_router(leave_router)
app.include_router(dept_router)
app.include_router(shift_router)
app.include_router(settings_router)
app.include_router(reports_router)
app.include_router(payroll_router)
app.add_event_handler("startup", start_scheduler)


@app.on_event("startup")
async def startup():
    import app.models.payroll  # noqa – registers payroll tables with Base
    await init_db()

@app.get("/")
async def root():
    return {"message": "AttendPro API", "version": "1.0.0"}

@app.get("/health")
async def health():
    return {"status": "ok"}
