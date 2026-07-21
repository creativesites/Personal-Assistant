import asyncio
import os
import sys

# Add the app directory to the python path
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

from app.database import get_pool, close_pool

async def main():
    print("Testing DB connection...")
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            val = await conn.fetchval("SELECT 1")
            print("Successfully connected! SELECT 1 returned:", val)
    except Exception as e:
        print("DB Connection failed:", type(e), repr(e))
        import traceback
        traceback.print_exc()
    finally:
        await close_pool()

if __name__ == '__main__':
    asyncio.run(main())
