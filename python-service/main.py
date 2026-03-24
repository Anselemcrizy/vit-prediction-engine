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
        # Get match data from Understat
        match_data = get_match_data(
            request.home_team,
            request.away_team,
            request.league,
            request.season
        )

        # Fit model with team data if we have enough matches
        # For now, we'll use the attack/defense strengths directly
        home_attack = match_data.get("home_attack", 1.0)
        home_defense = match_data.get("home_defense", 1.0)
        away_attack = match_data.get("away_attack", 1.0)
        away_defense = match_data.get("away_defense", 1.0)

        # Calculate expected goals using team strengths
        league_avg = 2.5  # Could be calculated from league data
        home_advantage = 1.2

        home_xg = (home_attack * away_defense * league_avg) * home_advantage
        away_xg = away_attack * home_defense * league_avg

        # Run prediction
        result = model.simulate_match(home_xg, away_xg)

        # Add metadata
        result["model_meta"] = {
            "model": "Poisson Monte Carlo with Understat xG",
            "home_xg": round(home_xg, 2),
            "away_xg": round(away_xg, 2),
            "home_attack": round(home_attack, 2),
            "home_defense": round(home_defense, 2),
            "away_attack": round(away_attack, 2),
            "away_defense": round(away_defense, 2),
            "data_source": "Understat"
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

    except Exception as e:
        processing_time = (time.time() - start_time) * 1000
        raise HTTPException(
            status_code=500,
            detail=f"Prediction failed: {str(e)}"
        )

@app.get("/health")
def health_check():
    return {"status": "healthy", "timestamp": time.time()}
