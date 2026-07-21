import asyncio
import os
import sys

# Add the app directory to the python path
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

from app.services.job_scraper import run_all_scrapers
from app.database import get_pool, close_pool

async def main():
    print("Starting scraper test...")
    try:
        results = await run_all_scrapers()
        print("Scraper results:", results)
    except Exception as e:
        print("Error running scrapers:", type(e), repr(e))
        import traceback
        traceback.print_exc()
    finally:
        await close_pool()

if __name__ == '__main__':
    asyncio.run(main())
