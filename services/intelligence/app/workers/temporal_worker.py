import structlog
from bullmq import Worker
from ..queue import redis_conn_opts
from ..services.clock_engine import ClockEngine
from ..services.cadence_learner import CadenceLearner
from ..services.relationship_memory import RelationshipMemoryService

log = structlog.get_logger()

_engine = ClockEngine()
_learner = CadenceLearner()
_relationship_memory = RelationshipMemoryService()


async def _process(job, token: str):
    data = job.data
    user_id = data.get('userId')
    contact_id = data.get('contactId')

    if contact_id and user_id:
        # Per-contact cadence update (triggered after each message)
        await _learner.learn(contact_id, user_id)
        await _relationship_memory.recompute(contact_id, user_id)
    elif user_id:
        # Full clock evaluation for one user
        await _engine.evaluate_for_user(user_id)
    else:
        # Full clock evaluation for all users
        await _engine.evaluate_all_users()

    return {'ok': True}


def create_temporal_worker() -> Worker:
    return Worker('temporal.clock_check', _process, {'connection': redis_conn_opts()})
