from .base import BaseScraper
from .gozambia import GoZambiaScraper
from .jobsearchzm import JobSearchZMScraper
from .jobberman import JobbermanZMScraper
from .greatzambia import GreatZambiaJobsScraper
from .facebook_groups import FacebookZambiaJobsScraper

_SCRAPERS = [
    GoZambiaScraper(),
    JobSearchZMScraper(),
    JobbermanZMScraper(),
    GreatZambiaJobsScraper(),
    FacebookZambiaJobsScraper(),
]
