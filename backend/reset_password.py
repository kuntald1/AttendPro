import asyncio
from sqlalchemy import text
from app.core.database import AsyncSessionLocal
from app.core.security import hash_password

async def go():
    async with AsyncSessionLocal() as db:
        h = hash_password('kuntal123')
        await db.execute(text('UPDATE users SET hashed_password = :h WHERE email = :e'), {'h': h, 'e': 'kuntal@gmail.com'})
        await db.commit()
        print('Password reset to: kuntal123')

asyncio.run(go())
