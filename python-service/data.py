import requests
import pandas as pd
from typing import Dict, List, Optional
import json
import time
from functools import lru_cache
import re
from understatapi import UnderstatClient
import numpy as np

class UnderstatDataProvider:
    def __init__(self):
        self.client = UnderstatClient()
        self._cache = {}
        self._cache_timeout = 3600  # 1 hour

    @lru_cache(maxsize=100)
    def _get_cache_key(self, league: str, season: int) -> str:
        return f"{league}_{season}"

    def _parse_understat_embedded_json(self, html: str, variable_name: str) -> List[Dict]:
        pattern = re.compile(rf"{variable_name}\s*=\s*JSON\.parse\('(.+?)'\);", re.DOTALL)
        match = pattern.search(html)
        if not match:
            return []

        data_json = match.group(1).encode('utf-8').decode('unicode_escape')
        try:
            data = json.loads(data_json)
        except Exception:
            return []

        return data

    def get_league_matches(self, league: str, season: int) -> List[Dict]:
        """Get all matches for a league season from Understat"""
        cache_key = self._get_cache_key(league, season)
        current_time = time.time()

        if cache_key in self._cache:
            cached_data, timestamp = self._cache[cache_key]
            if current_time - timestamp < self._cache_timeout:
                return cached_data

        try:
            # Use understatapi library - correct API call
            league_obj = self.client.league(league=league.upper())
            matches = league_obj.get_match_data(season=str(season))
            
            print(f"✓ Successfully fetched {len(matches)} matches from Understat for {league} {season}")
            self._cache[cache_key] = (matches, current_time)
            return matches
        except Exception as e:
            print(f"✗ Error fetching Understat data: {e}")
            return []

    def get_team_stats(self, team_name: str, league: str, season: int) -> Optional[Dict]:
        """Get team statistics from Understat"""
        matches = self.get_league_matches(league, season)

        team_matches = [
            match for match in matches
            if match.get('h', {}).get('title') == team_name or match.get('a', {}).get('title') == team_name
        ]

        if not team_matches:
            return None

        # Calculate team statistics
        goals_scored = 0
        goals_conceded = 0
        xg_scored = 0
        xg_conceded = 0
        wins = 0
        draws = 0
        losses = 0

        for match in team_matches:
            is_home = match['h']['title'] == team_name

            if is_home:
                goals_scored += match['goals']['h']
                goals_conceded += match['goals']['a']
                xg_scored += match['xG']['h']
                xg_conceded += match['xG']['a']

                if match['goals']['h'] > match['goals']['a']:
                    wins += 1
                elif match['goals']['h'] == match['goals']['a']:
                    draws += 1
                else:
                    losses += 1
            else:
                goals_scored += match['goals']['a']
                goals_conceded += match['goals']['h']
                xg_scored += match['xG']['a']
                xg_conceded += match['xG']['h']

                if match['goals']['a'] > match['goals']['h']:
                    wins += 1
                elif match['goals']['a'] == match['goals']['h']:
                    draws += 1
                else:
                    losses += 1

        matches_played = len(team_matches)

        return {
            'team': team_name,
            'matches_played': matches_played,
            'wins': wins,
            'draws': draws,
            'losses': losses,
            'goals_scored': goals_scored,
            'goals_conceded': goals_conceded,
            'xg_scored': xg_scored,
            'xg_conceded': xg_conceded,
            'avg_goals_scored': goals_scored / matches_played if matches_played > 0 else 0,
            'avg_goals_conceded': goals_conceded / matches_played if matches_played > 0 else 0,
            'avg_xg_scored': xg_scored / matches_played if matches_played > 0 else 0,
            'avg_xg_conceded': xg_conceded / matches_played if matches_played > 0 else 0,
            'attack_strength': xg_scored / matches_played if matches_played > 0 else 1.0,
            'defense_strength': xg_conceded / matches_played if matches_played > 0 else 1.0
        }

    def get_match_forecast(self, home_team: str, away_team: str, league: str, season: int) -> Optional[Dict]:
        """Get Understat forecast for a specific match"""
        matches = self.get_league_matches(league, season)

        # Find recent matches for these teams
        home_matches = [
            match for match in matches
            if match.get('h', {}).get('title') == home_team or match.get('a', {}).get('title') == away_team
        ][:5]  # Last 5 matches

        away_matches = [
            match for match in matches
            if match.get('a', {}).get('title') == away_team or match.get('h', {}).get('title') == home_team
        ][:5]  # Last 5 matches

        if not home_matches or not away_matches:
            return None

        # Calculate average forecast probabilities from recent matches
        home_win_probs = []
        draw_probs = []
        away_win_probs = []

        for match in home_matches + away_matches:
            if 'forecast' in match:
                forecast = match['forecast']
                home_win_probs.append(forecast.get('win', 0))
                draw_probs.append(forecast.get('draw', 0))
                away_win_probs.append(forecast.get('loss', 0))

        if not home_win_probs:
            return None

        return {
            'home_win_forecast': sum(home_win_probs) / len(home_win_probs),
            'draw_forecast': sum(draw_probs) / len(draw_probs),
            'away_win_forecast': sum(away_win_probs) / len(away_win_probs)
        }

# Global instance
try:
    data_provider = UnderstatDataProvider()
except Exception as e:
    print(f"Warning: Failed to initialize Understat data provider: {e}")
    data_provider = None

def compute_team_strength(matches: List[Dict], team: str) -> tuple[float, float]:
    """Compute team attack and defense strength from historical matches"""
    home_matches = [m for m in matches if m.get('h', {}).get('title') == team]
    away_matches = [m for m in matches if m.get('a', {}).get('title') == team]

    print(f"  → {team}: {len(home_matches)} home, {len(away_matches)} away matches")

    if not home_matches and not away_matches:
        print(f"  ⚠ {team} NOT FOUND in dataset")
        return 1.0, 1.0  # Default values

    home_xg = [float(m.get('xG', {}).get('h', 0)) for m in home_matches]
    away_xg = [float(m.get('xG', {}).get('a', 0)) for m in away_matches]

    home_xga = [float(m.get('xG', {}).get('a', 0)) for m in home_matches]
    away_xga = [float(m.get('xG', {}).get('h', 0)) for m in away_matches]

    attack = np.mean(home_xg + away_xg) if (home_xg + away_xg) else 1.0
    defense = np.mean(home_xga + away_xga) if (home_xga + away_xga) else 1.0

    print(f"    • Attack: {attack:.3f}, Defense: {defense:.3f}")

    return attack, defense

def expected_goals(home_attack: float, away_defense: float, league_avg: float = 1.35) -> float:
    """Calculate expected goals using team strengths"""
    return home_attack * away_defense / league_avg

def match_probabilities(lambda_home: float, lambda_away: float) -> tuple[float, float, float]:
    """Simulate match probabilities using Poisson distribution"""
    from scipy.stats import poisson

    max_goals = 5
    home_win = 0.0
    draw = 0.0
    away_win = 0.0

    for i in range(max_goals + 1):
        for j in range(max_goals + 1):
            prob = poisson.pmf(i, lambda_home) * poisson.pmf(j, lambda_away)
            if i > j:
                home_win += prob
            elif i == j:
                draw += prob
            else:
                away_win += prob

    # Normalize to ensure probabilities sum to 1.0
    total = home_win + draw + away_win
    if total > 0:
        home_win = home_win / total
        draw = draw / total
        away_win = away_win / total

    return home_win, draw, away_win

def format_matches(matches: List[Dict]) -> List[Dict]:
    """Convert Understat data to standardized format for analysis
    
    Extracts:
    - Teams (h.title, a.title)
    - Expected goals (xG.h, xG.a)
    - Actual goals (goals.h, goals.a)
    """
    formatted = []
    
    for m in matches:
        try:
            formatted.append({
                "home_team": m.get("h", {}).get("title", "Unknown"),
                "away_team": m.get("a", {}).get("title", "Unknown"),
                "home_xg": float(m.get("xG", {}).get("h", 0)),
                "away_xg": float(m.get("xG", {}).get("a", 0)),
                "home_goals": int(m.get("goals", {}).get("h", 0)),
                "away_goals": int(m.get("goals", {}).get("a", 0)),
            })
        except (ValueError, TypeError, KeyError) as e:
            print(f"  ⚠ Skipping malformed match: {e}")
            continue
    
    return formatted

def get_match_data(home_team: str, away_team: str, league: str = "EPL", season: int = 2024):
    """Get match data for prediction using team strength profiles"""
    try:
        if data_provider is None:
            raise Exception("Data provider not initialized")

        print(f"\n{'='*70}")
        print(f"PREDICTION: {home_team} vs {away_team} ({league} {season})")
        print(f"{'='*70}")

        # STEP 1: Fetch historical data
        print(f"\n[STEP 1] Understat → Parse → Load historical matches")
        raw_matches = data_provider.get_league_matches(league, season)
        print(f"✓ Loaded {len(raw_matches)} raw matches")

        if len(raw_matches) == 0:
            raise Exception(f"No match data from Understat for {league} {season}")

        # STEP 1.5: Format and validate data
        print(f"\n[STEP 1.5] Format matches → Validate data quality")
        matches = format_matches(raw_matches)
        print(f"✓ Formatted {len(matches)} matches\n")
        
        if len(matches) == 0:
            raise Exception("All matches were malformed - data extraction failed")

        # STEP 2: Extract team strength profiles
        print(f"[STEP 2] Team stats → Extract attack/defense strength")
        home_attack, home_defense = compute_team_strength(raw_matches, home_team)
        away_attack, away_defense = compute_team_strength(raw_matches, away_team)

        # STEP 3: Calculate Poisson parameters
        print(f"\n[STEP 3] Poisson model → Calculate expected goals")
        league_avg = 1.35
        home_advantage = 1.2

        home_lambda = expected_goals(home_attack * home_advantage, away_defense, league_avg)
        away_lambda = expected_goals(away_attack, home_defense, league_avg)

        print(f"  • {home_team} λ = {home_lambda:.3f} (attack={home_attack:.3f}, def={home_defense:.3f})")
        print(f"  • {away_team} λ = {away_lambda:.3f} (attack={away_attack:.3f}, def={away_defense:.3f})\n")

        # STEP 4: Run Poisson simulation
        print(f"[STEP 4] Predictions → Match result probabilities")
        home_win, draw, away_win = match_probabilities(home_lambda, away_lambda)

        # Validation: probabilities should sum to ~1.0
        total_prob = home_win + draw + away_win
        if abs(total_prob - 1.0) > 0.01:
            print(f"  ⚠ WARNING: Probabilities sum to {total_prob:.3f} (should be ~1.0)")

        print(f"  ✓ {home_team} Win: {home_win:.1%}")
        print(f"  ✓ Draw: {draw:.1%}")
        print(f"  ✓ {away_team} Win: {away_win:.1%}")
        print(f"{'='*70}\n")

        # Return the exact structure the frontend expects
        return {
            "homeWinProb": float(home_win),
            "drawProb": float(draw),
            "awayWinProb": float(away_win)
        }

    except Exception as e:
        print(f"\n✗ ERROR in prediction pipeline: {type(e).__name__}: {e}")
        print(f"{'='*70}\n")
        # Fallback
        return {
            "homeWinProb": 0.45,
            "drawProb": 0.30,
            "awayWinProb": 0.25
        }

def get_data():
    """Legacy function for backward compatibility"""
    return asyncio.run(get_match_data("Arsenal", "Chelsea"))
