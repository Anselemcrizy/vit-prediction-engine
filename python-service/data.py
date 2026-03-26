import requests
import pandas as pd
from typing import Dict, List, Optional
import json
import time
from functools import lru_cache
import re
from understatapi import UnderstatClient

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
            # Use understatapi library
            data = self.client.get_league_data(league.lower(), season)
            matches = data.get('matches', [])
            self._cache[cache_key] = (matches, current_time)
            return matches
        except Exception as e:
            print(f"Error fetching Understat data: {e}")
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

def get_match_data(home_team: str, away_team: str, league: str = "EPL", season: int = 2024):
    """Get match data for prediction"""
    try:
        # Return fallback if data provider not initialized
        if data_provider is None:
            raise Exception("Data provider not initialized")
            
        # Get team statistics
        home_stats = data_provider.get_team_stats(home_team, league, season)
        away_stats = data_provider.get_team_stats(away_team, league, season)

        if not home_stats or not away_stats:
            # Fallback to basic data if team not found
            return {
                "home": home_team,
                "away": away_team,
                "home_xg": 1.5,
                "away_xg": 1.2,
                "home_attack": 1.0,
                "home_defense": 1.0,
                "away_attack": 1.0,
                "away_defense": 1.0,
                "forecast_win": 0.4,
                "forecast_draw": 0.3,
                "forecast_loss": 0.3
            }

        # Get forecast data
        forecast = data_provider.get_match_forecast(home_team, away_team, league, season)
        forecast_win = forecast['home_win_forecast'] if forecast else 0.4
        forecast_draw = forecast['draw_forecast'] if forecast else 0.3
        forecast_loss = forecast['away_win_forecast'] if forecast else 0.3

        return {
            "home": home_team,
            "away": away_team,
            "home_xg": home_stats['avg_xg_scored'],
            "away_xg": away_stats['avg_xg_scored'],
            "home_attack": home_stats['attack_strength'],
            "home_defense": home_stats['defense_strength'],
            "away_attack": away_stats['attack_strength'],
            "away_defense": away_stats['defense_strength'],
            "forecast_win": forecast_win,
            "forecast_draw": forecast_draw,
            "forecast_loss": forecast_loss
        }
    except Exception as e:
        print(f"Error getting match data: {e}")
        # Fallback
        return {
            "home": home_team,
            "away": away_team,
            "home_xg": 1.5,
            "away_xg": 1.2,
            "home_attack": 1.0,
            "home_defense": 1.0,
            "away_attack": 1.0,
            "away_defense": 1.0,
            "forecast_win": 0.4,
            "forecast_draw": 0.3,
            "forecast_loss": 0.3
        }

def get_data():
    """Legacy function for backward compatibility"""
    return asyncio.run(get_match_data("Arsenal", "Chelsea"))
