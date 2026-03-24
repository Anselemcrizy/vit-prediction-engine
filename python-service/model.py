import numpy as np
from typing import Optional, Dict, Tuple
from scipy import stats
import pandas as pd

class FootballPredictionModel:
    """
    Enhanced football prediction model using Poisson regression with team strength
    and home advantage parameters.
    """
    
    def __init__(self):
        self.team_attack: Dict[str, float] = {}
        self.team_defense: Dict[str, float] = {}
        self.home_advantage: float = 1.2  # Average home advantage multiplier
        self.league_avg_goals: float = 2.5  # Average goals per game
        self.theta: float = 1.0  # Dispersion parameter for negative binomial
        
    def fit(self, matches_df: pd.DataFrame):
        """
        Fit team strength parameters based on historical match data.
        
        Args:
            matches_df: DataFrame with columns: home_team, away_team, home_goals, away_goals
        """
        teams = pd.unique(matches_df[['home_team', 'away_team']].values.ravel())
        
        # Initialize parameters
        n_teams = len(teams)
        team_to_idx = {team: i for i, team in enumerate(teams)}
        
        # Design matrix for team strengths
        n_matches = len(matches_df)
        X_attack = np.zeros((n_matches * 2, n_teams))
        X_defense = np.zeros((n_matches * 2, n_teams))
        y = np.zeros(n_matches * 2)
        
        for i, (_, row) in enumerate(matches_df.iterrows()):
            home_idx = team_to_idx[row['home_team']]
            away_idx = team_to_idx[row['away_team']]
            
            # Home team (attacking)
            X_attack[i, home_idx] = 1
            X_defense[i, away_idx] = 1
            y[i] = row['home_goals']
            
            # Away team (attacking)
            X_attack[n_matches + i, away_idx] = 1
            X_defense[n_matches + i, home_idx] = 1
            y[n_matches + i] = row['away_goals']
        
        # Fit Poisson regression with regularization
        from sklearn.linear_model import PoissonRegressor
        
        # Combine attack and defense features
        X = np.hstack([X_attack, X_defense])
        
        # Fit model
        model = PoissonRegressor(alpha=0.1, max_iter=1000)
        model.fit(X, y)
        
        # Extract parameters
        self.team_attack = {team: model.coef_[i] for team, i in team_to_idx.items()}
        self.team_defense = {team: model.coef_[n_teams + i] for team, i in team_to_idx.items()}
        
        # Calculate home advantage
        home_goals_avg = matches_df['home_goals'].mean()
        away_goals_avg = matches_df['away_goals'].mean()
        self.home_advantage = home_goals_avg / away_goals_avg if away_goals_avg > 0 else 1.2
        
        # League average
        self.league_avg_goals = (matches_df['home_goals'].mean() + matches_df['away_goals'].mean()) / 2
        
    def predict_match(self, home_team: str, away_team: str, 
                     simulations: int = 50000) -> dict:
        """
        Predict match outcome using fitted team strengths.
        
        Args:
            home_team: Name of home team
            away_team: Name of away team
            simulations: Number of Monte Carlo simulations
        """
        # Get team strengths (with defaults for unknown teams)
        home_attack = self.team_attack.get(home_team, 0)
        home_defense = self.team_defense.get(home_team, 0)
        away_attack = self.team_attack.get(away_team, 0)
        away_defense = self.team_defense.get(away_team, 0)
        
        # Calculate expected goals
        home_xg = np.exp(self.home_advantage + home_attack - away_defense) * self.league_avg_goals
        away_xg = np.exp(away_attack - home_defense) * self.league_avg_goals
        
        return self.simulate_match(home_xg, away_xg, simulations)
    
    def predict(self, home_xg: float, away_xg: float, simulations: int = 50000) -> dict:
        """
        Legacy predict function for backward compatibility.
        """
        return self.simulate_match(home_xg, away_xg, simulations)
    
    def simulate_match(self, home_xg: float, away_xg: float, 
                      simulations: int = 50000) -> dict:
        """
        Enhanced Monte Carlo simulation with correlation and dispersion.
        """
        np.random.seed(None)
        
        # Use negative binomial for overdispersion if theta != 1
        if self.theta != 1.0:
            # Negative binomial (more realistic for football)
            home_probs = stats.nbinom(n=self.theta, p=self.theta/(self.theta + home_xg))
            away_probs = stats.nbinom(n=self.theta, p=self.theta/(self.theta + away_xg))
            home_goals = home_probs.rvs(simulations)
            away_goals = away_probs.rvs(simulations)
        else:
            # Poisson (simpler case)
            home_goals = np.random.poisson(home_xg, simulations)
            away_goals = np.random.poisson(away_xg, simulations)
        
        # Add small correlation between home and away goals
        correlation = 0.1  # Slight negative correlation often observed
        if correlation != 0:
            # Apply correlation using copula approach
            from scipy.stats import norm
            u = norm.cdf(np.random.normal(0, 1, simulations))
            v = norm.cdf(np.random.normal(0, 1, simulations))
            
            # Adjust based on correlation (simplified approach)
            if correlation < 0:
                v = 1 - v
            
            home_goals_corr = np.percentile(home_goals, u * 100)
            away_goals_corr = np.percentile(away_goals, v * 100)
            home_goals, away_goals = home_goals_corr, away_goals_corr
        
        # Calculate probabilities
        home_win = float((home_goals > away_goals).mean())
        draw = float((home_goals == away_goals).mean())
        away_win = float((home_goals < away_goals).mean())
        
        # Calculate scoreline probabilities
        score_counts: Dict[Tuple[int, int], int] = {}
        for h, a in zip(home_goals.astype(int), away_goals.astype(int)):
            if h <= 10 and a <= 10:  # Limit to reasonable scores
                score_counts[(h, a)] = score_counts.get((h, a), 0) + 1
        
        # Get top scorelines
        top_scores = sorted(score_counts.items(), key=lambda x: -x[1])[:10]
        score_simulations = [
            {
                "home": h, 
                "away": a, 
                "probability": round(count / simulations, 4)
            }
            for (h, a), count in top_scores
        ]
        
        # Calculate expected goals
        expected_home = float(np.mean(home_goals))
        expected_away = float(np.mean(away_goals))
        
        # Calculate confidence intervals (90% CI)
        home_ci = (float(np.percentile(home_goals, 5)), 
                   float(np.percentile(home_goals, 95)))
        away_ci = (float(np.percentile(away_goals, 5)), 
                   float(np.percentile(away_goals, 95)))
        
        # Calculate over/under probabilities
        over_2_5 = float((home_goals + away_goals > 2.5).mean())
        over_3_5 = float((home_goals + away_goals > 3.5).mean())
        btts = float(((home_goals > 0) & (away_goals > 0)).mean())
        
        return {
            "home_win": round(home_win, 4),
            "draw": round(draw, 4),
            "away_win": round(away_win, 4),
            "expected_goals": {
                "home": round(expected_home, 2),
                "away": round(expected_away, 2),
                "total": round(expected_home + expected_away, 2)
            },
            "confidence_intervals": {
                "home": [round(ci, 2) for ci in home_ci],
                "away": [round(ci, 2) for ci in away_ci]
            },
            "score_simulations": score_simulations,
            "additional_markets": {
                "over_2_5": round(over_2_5, 4),
                "over_3_5": round(over_3_5, 4),
                "btts": round(btts, 4)
            },
            "expected_xg": {
                "home": round(home_xg, 2),
                "away": round(away_xg, 2)
            }
        }
    
    def predict_with_bayesian_update(self, home_team: str, away_team: str,
                                     current_score: Tuple[int, int],
                                     minutes_played: int,
                                     simulations: int = 50000) -> dict:
        """
        Update predictions based on current match state (in-play).
        
        Args:
            home_team: Home team name
            away_team: Away team name
            current_score: Current score (home, away)
            minutes_played: Minutes played so far
            simulations: Number of simulations
        """
        base_prediction = self.predict_match(home_team, away_team, simulations)
        home_xg = base_prediction['expected_xg']['home']
        away_xg = base_prediction['expected_xg']['away']
        
        # Adjust for time remaining
        time_remaining = (90 - minutes_played) / 90
        home_xg_remaining = home_xg * time_remaining
        away_xg_remaining = away_xg * time_remaining
        
        # Simulate remaining time
        np.random.seed(None)
        home_goals_remaining = np.random.poisson(home_xg_remaining, simulations)
        away_goals_remaining = np.random.poisson(away_xg_remaining, simulations)
        
        # Add to current score
        final_home = current_score[0] + home_goals_remaining
        final_away = current_score[1] + away_goals_remaining
        
        # Calculate updated probabilities
        home_win = float((final_home > final_away).mean())
        draw = float((final_home == final_away).mean())
        away_win = float((final_home < final_away).mean())
        
        return {
            "home_win": round(home_win, 4),
            "draw": round(draw, 4),
            "away_win": round(away_win, 4),
            "expected_goals_remaining": {
                "home": round(float(np.mean(home_goals_remaining)), 2),
                "away": round(float(np.mean(away_goals_remaining)), 2)
            }
        }


# Example usage
if __name__ == "__main__":
    # Sample data structure
    sample_data = pd.DataFrame({
        'home_team': ['TeamA', 'TeamC', 'TeamA', 'TeamB'],
        'away_team': ['TeamB', 'TeamD', 'TeamC', 'TeamD'],
        'home_goals': [2, 1, 3, 0],
        'away_goals': [1, 1, 0, 2]
    })
    
    # Initialize and fit model
    model = FootballPredictionModel()
    model.fit(sample_data)
    
    # Make prediction
    result = model.predict_match("TeamA", "TeamB", simulations=10000)
    
    print("Match Prediction:")
    print(f"Home Win: {result['home_win']:.2%}")
    print(f"Draw: {result['draw']:.2%}")
    print(f"Away Win: {result['away_win']:.2%}")
    print(f"\nExpected Goals: {result['expected_goals']}")
    print(f"\nTop Scorelines:")
    for score in result['score_simulations'][:5]:
        print(f"  {score['home']}-{score['away']}: {score['probability']:.2%}")
