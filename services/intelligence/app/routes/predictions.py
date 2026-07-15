from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..neural.prediction import PredictionEngine

# Zuri Neural Layer Phase 5 — Prediction Engine (docs/NEURAL_LAYER_PLAN.md
# §4.8/§10). Internal-only: services/api/src/routes/predictions.ts proxies
# GET /api/predictions/:predictionType/:subjectId here.

router = APIRouter(prefix='/internal/predictions', tags=['predictions'])
_engine = PredictionEngine()


class PredictRequest(BaseModel):
    userId: str
    subjectId: str


@router.post('/{prediction_type}')
async def predict(prediction_type: str, body: PredictRequest):
    prediction = await _engine.predict(prediction_type, body.subjectId, body.userId)
    if prediction is None:
        raise HTTPException(status_code=404, detail='No prediction available')
    return prediction.model_dump()
