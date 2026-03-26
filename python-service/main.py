from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from model import FootballPredictionModel
from data import get_match_data, data_provider
import asyncio
import time

app = FastAPI()

class PredictionRequest(BaseModel):
    sport: str = "football"
    home_team: str
    away_team: str
    league: str = "EPL"
    season: int = 2024

class PredictionResponse(BaseModel):
    home_win: float
    draw: float
    away_win: float
    predicted_home_score: float
    predicted_away_score: float
    score_simulations: list
    model_meta: dict
    processing_time_ms: float

# Global model instance
model = FootballPredictionModel()

@app.on_event("startup")
async def startup_event():
    """Initialize the model with historical data on startup"""
    try:
        # In a real implementation, you'd load historical data here
        # For now, we'll initialize with empty data and fit on demand
        pass
    except Exception as e:
        print(f"Error initializing model: {e}")

@app.on_event("shutdown")
def shutdown_event():
    """Clean up resources"""
    # No persistent session to close with the current data provider implementation
    return None

@app.get("/")
def home():
    return {"status": "VIT Engine Running", "version": "2.0"}

@app.post("/predict")
async def run_prediction(request: PredictionRequest):
    start_time = time.time()

    try:
        # Get match probabilities directly from data provider
        probabilities = get_match_data(
            request.home_team,
            request.away_team,
            request.league,
            request.season
        )

        # VALIDATE: Check if we got valid probabilities
        if not probabilities or "homeWinProb" not in probabilities:
            raise HTTPException(
                status_code=500,
                detail=f"Invalid response from prediction model for {request.home_team} vs {request.away_team}"
            )

        # Validate probabilities sum close to 1.0
        prob_sum = probabilities["homeWinProb"] + probabilities["drawProb"] + probabilities["awayWinProb"]
        if abs(prob_sum - 1.0) > 0.01:
            print(f"⚠ WARNING: Probabilities sum to {prob_sum} instead of 1.0")

        # For backward compatibility with the model interface, create a mock result
        # The actual probabilities come from the data provider now
        result = {
            "home_win": probabilities["homeWinProb"],
            "draw": probabilities["drawProb"],
            "away_win": probabilities["awayWinProb"],
            "expected_goals": {"home": 1.5, "away": 1.2},  # Mock values
            "score_simulations": [
                {"home": 1, "away": 0, "probability": 0.3},
                {"home": 2, "away": 1, "probability": 0.2},
                {"home": 1, "away": 1, "probability": 0.25},
                {"home": 0, "away": 0, "probability": 0.15},
                {"home": 2, "away": 0, "probability": 0.1}
            ]
        }

        # Add metadata
        result["model_meta"] = {
            "model": "Poisson Team Strength Model",
            "data_source": "Understat Historical Matches",
            "method": "Team strength profiles from xG data"
        }

        processing_time = (time.time() - start_time) * 1000

        response = PredictionResponse(
            home_win=result["home_win"],
            draw=result["draw"],
            away_win=result["away_win"],
            predicted_home_score=result["expected_goals"]["home"],
            predicted_away_score=result["expected_goals"]["away"],
            score_simulations=result["score_simulations"],
            model_meta=result["model_meta"],
            processing_time_ms=round(processing_time, 2)
        )

        return response.dict()

    except HTTPException:
        raise
    except Exception as e:
        processing_time = (time.time() - start_time) * 1000
        print(f"✗ API ERROR: {type(e).__name__}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Prediction failed: {str(e)}"
        )

@app.get("/health")
def health_check():
    return {"status": "healthy", "timestamp": time.time()}
