-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- This runs automatically when the DB container starts for the first time.
-- Tables are created by SQLAlchemy on backend startup.
-- We seed the admin user after tables exist via the seed script.

SELECT 'pgvector extension enabled' AS status;
