/**
 * VIT — Value Intelligence Trust Prediction Engine
 * Orchestrates the Python model service and builds full betting market analysis.
 */

export type Sport = "football" | "basketball" | "tennis";

export interface MarketPrediction {
  market: string;
  prediction: string;
  confidence: number;
  ev: number;
  recommendedOdds: number;
}

export interface ScoreSimulation {
  home: number;
  away: number;
  probability: number;
}

export interface VitResult {
  homeTeam: string;
  awayTeam: string;
  homeWinProb: number;
  drawProb: number | null;
  awayWinProb: number;
  predictedHomeScore: number | null;
  predictedAwayScore: number | null;
  bestBet: string;
  bestBetEv: number;
  bestBetConfidence: number;
  valueRating: string;
  aiConsensus: string;
  marketPredictions: MarketPrediction[];
  scoreSimulations: ScoreSimulation[];
  processingTimeMs: number;
}

const PYTHON_SERVICE_URL = "http://localhost:5000";

interface PythonPredictResponse {
  home_win: number;
  draw: number | null;
  away_win: number;
  predicted_home_score: number | null;
  predicted_away_score: number | null;
  score_simulations: Array<{ home: number; away: number; probability: number }>;
  model_meta: Record<string, unknown>;
  processing_time_ms: number;
}

async function callPythonModel(
  sport: Sport,
  homeTeam: string,
  awayTeam: string,
  league: string = "EPL",
  season: number = 2024,
): Promise<PythonPredictResponse> {
  try {
    console.log(`Calling Python service at ${PYTHON_SERVICE_URL}/predict`, {
      sport,
      homeTeam,
      awayTeam,
      league,
      season,
    });
    
    const res = await fetch(`${PYTHON_SERVICE_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sport,
        home_team: homeTeam,
        away_team: awayTeam,
        league,
        season,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`Python service error ${res.status}:`, text);
      throw new Error(`Python model service error ${res.status}: ${text}`);
    }

    const data = await res.json() as PythonPredictResponse;
    console.log("Python service response:", data);
    return data;
  } catch (error) {
    console.error("Error calling Python service:", error);
    throw error;
  }
}

function round2(v: number) {
  return Math.round(v * 100) / 100;
}

function round4(v: number) {
  return Math.round(v * 10000) / 10000;
}

function getValueRating(ev: number): string {
  if (ev >= 0.20) return "STRONG VALUE";
  if (ev >= 0.10) return "GOOD VALUE";
  if (ev >= 0.03) return "MODERATE";
  if (ev >= -0.05) return "LOW VALUE";
  return "NO VALUE";
}

function impliedOdds(prob: number): number {
  return round2(1 / Math.max(0.01, prob));
}

function computeEv(trueProb: number, marketProb: number): number {
  return round4(trueProb / marketProb - 1);
}

function buildFootballMarkets(
  homeWin: number, draw: number, awayWin: number,
  homeScore: number, awayScore: number,
): MarketPrediction[] {
  const total = homeScore + awayScore;
  const over25 = total > 2.45 ? Math.min(0.82, 0.48 + (total - 2.45) * 0.18) : Math.max(0.22, 0.48 - (2.45 - total) * 0.18);
  const btts = Math.min(homeScore, awayScore) > 0.75 ? Math.min(0.78, 0.45 + Math.min(homeScore, awayScore) * 0.2) : Math.max(0.22, 0.42 - (0.75 - Math.min(homeScore, awayScore)) * 0.3);

  const marketOddsVigor = 1.06;

  const markets: MarketPrediction[] = [
    {
      market: "Match Result",
      prediction: homeWin >= awayWin && homeWin >= draw ? "Home Win" : awayWin >= draw ? "Away Win" : "Draw",
      confidence: round4(Math.max(homeWin, awayWin, draw)),
      ev: computeEv(Math.max(homeWin, awayWin, draw), Math.max(homeWin, awayWin, draw) * marketOddsVigor),
      recommendedOdds: round2(impliedOdds(Math.max(homeWin, awayWin, draw)) * 0.97),
    },
    {
      market: "Over/Under 2.5",
      prediction: over25 > 0.5 ? "Over 2.5 Goals" : "Under 2.5 Goals",
      confidence: round4(Math.max(over25, 1 - over25)),
      ev: computeEv(Math.max(over25, 1 - over25), Math.max(over25, 1 - over25) * marketOddsVigor),
      recommendedOdds: round2(impliedOdds(Math.max(over25, 1 - over25)) * 0.97),
    },
    {
      market: "BTTS",
      prediction: btts > 0.5 ? "BTTS Yes" : "BTTS No",
      confidence: round4(Math.max(btts, 1 - btts)),
      ev: computeEv(Math.max(btts, 1 - btts), Math.max(btts, 1 - btts) * marketOddsVigor),
      recommendedOdds: round2(impliedOdds(Math.max(btts, 1 - btts)) * 0.97),
    },
    {
      market: "Double Chance",
      prediction: homeWin + draw > 0.5 ? "Home/Draw" : "Away Win",
      confidence: round4(Math.max(homeWin + draw, awayWin)),
      ev: computeEv(Math.max(homeWin + draw, awayWin), Math.max(homeWin + draw, awayWin) * marketOddsVigor),
      recommendedOdds: round2(impliedOdds(Math.max(homeWin + draw, awayWin)) * 0.98),
    },
    {
      market: "First Half Result",
      prediction: homeWin > awayWin ? "Home/Draw HT" : "Away Win HT",
      confidence: round4(homeWin > awayWin ? Math.min(0.72, homeWin + draw * 0.55) : Math.min(0.72, awayWin + draw * 0.45)),
      ev: computeEv(0.52, 0.52 * marketOddsVigor),
      recommendedOdds: round2(1.85),
    },
  ];

  return markets;
}

function buildBasketballMarkets(
  homeWin: number, awayWin: number,
  homeScore: number, awayScore: number,
): MarketPrediction[] {
  const total = homeScore + awayScore;
  const overUnderLine = Math.round(total / 5) * 5;
  const spread = Math.abs(homeScore - awayScore);
  const favoredHome = homeScore > awayScore;
  const marketOddsVigor = 1.05;

  return [
    {
      market: "Moneyline",
      prediction: homeWin > 0.5 ? "Home Win" : "Away Win",
      confidence: round4(Math.max(homeWin, awayWin)),
      ev: computeEv(Math.max(homeWin, awayWin), Math.max(homeWin, awayWin) * marketOddsVigor),
      recommendedOdds: round2(impliedOdds(Math.max(homeWin, awayWin)) * 0.97),
    },
    {
      market: `Total Points O/U ${overUnderLine}`,
      prediction: total > overUnderLine ? `Over ${overUnderLine}` : `Under ${overUnderLine}`,
      confidence: round4(0.52),
      ev: computeEv(0.52, 0.52 * marketOddsVigor),
      recommendedOdds: round2(1.91),
    },
    {
      market: "Point Spread",
      prediction: favoredHome ? `Home -${Math.round(spread / 2)}` : `Away -${Math.round(spread / 2)}`,
      confidence: round4(Math.max(homeWin, awayWin) * 0.88),
      ev: computeEv(0.52, 0.52 * marketOddsVigor),
      recommendedOdds: round2(1.91),
    },
    {
      market: "First Quarter",
      prediction: homeWin > 0.5 ? "Home Q1" : "Away Q1",
      confidence: round4(0.50 + Math.abs(homeWin - 0.5) * 0.5),
      ev: computeEv(0.51, 0.51 * marketOddsVigor),
      recommendedOdds: round2(1.85),
    },
  ];
}

function buildTennisMarkets(
  homeWin: number, awayWin: number,
): MarketPrediction[] {
  const marketOddsVigor = 1.05;
  const topSets = homeWin > 0.55 ? "2-0" : homeWin > 0.45 ? "2-1" : awayWin > 0.55 ? "0-2" : "1-2";

  return [
    {
      market: "Match Winner",
      prediction: homeWin > 0.5 ? "Player 1 Win" : "Player 2 Win",
      confidence: round4(Math.max(homeWin, awayWin)),
      ev: computeEv(Math.max(homeWin, awayWin), Math.max(homeWin, awayWin) * marketOddsVigor),
      recommendedOdds: round2(impliedOdds(Math.max(homeWin, awayWin)) * 0.97),
    },
    {
      market: "Total Sets",
      prediction: Math.max(homeWin, awayWin) > 0.68 ? "Under 2.5 Sets" : "Over 2.5 Sets",
      confidence: round4(Math.max(homeWin, awayWin) > 0.68 ? 0.62 : 0.54),
      ev: computeEv(0.54, 0.54 * marketOddsVigor),
      recommendedOdds: round2(1.85),
    },
    {
      market: "Set 1 Winner",
      prediction: homeWin > 0.5 ? "Player 1" : "Player 2",
      confidence: round4(0.50 + Math.abs(homeWin - 0.5) * 0.7),
      ev: computeEv(0.50 + Math.abs(homeWin - 0.5) * 0.7, (0.50 + Math.abs(homeWin - 0.5) * 0.7) * marketOddsVigor),
      recommendedOdds: round2(impliedOdds(0.50 + Math.abs(homeWin - 0.5) * 0.7) * 0.97),
    },
    {
      market: "Correct Score (Sets)",
      prediction: topSets,
      confidence: round4(Math.max(homeWin, awayWin) * 0.55),
      ev: computeEv(Math.max(homeWin, awayWin) * 0.55, Math.max(homeWin, awayWin) * 0.55 * marketOddsVigor),
      recommendedOdds: round2(impliedOdds(Math.max(homeWin, awayWin) * 0.55) * 0.97),
    },
  ];
}

function generateConsensus(
  sport: Sport, homeTeam: string, awayTeam: string,
  homeWin: number, awayWin: number, draw: number | null,
  bestBet: string, ev: number, valueRating: string,
  meta: Record<string, unknown>,
): string {
  const homeP = Math.round(homeWin * 100);
  const awayP = Math.round(awayWin * 100);
  const evStr = ev >= 0 ? `+${(ev * 100).toFixed(1)}%` : `${(ev * 100).toFixed(1)}%`;

  const modelName = (meta.model as string) ?? "statistical model";
  const xgHint = sport === "football" && meta.home_xg != null
    ? ` (xG: ${meta.home_xg} vs ${meta.away_xg})`
    : "";

  const sportContext: Record<Sport, string> = {
    football: `xG-based Poisson simulation${xgHint}`,
    basketball: `pace-adjusted offensive/defensive efficiency ratings`,
    tennis: `serve & return win probability modeling`,
  };

  if (valueRating === "STRONG VALUE" || valueRating === "GOOD VALUE") {
    return `Our ${modelName} assigns ${homeTeam} a ${homeP}% win probability against ${awayTeam} at ${awayP}%, derived from ${sportContext[sport]}. The ${bestBet} market shows a clear mispricing with an EV of ${evStr} — the model estimates this outcome is being undervalued by bookmakers. AI consensus: strong alignment across simulations, this is a confident edge.`;
  }
  return `${modelName} simulations give ${homeTeam} ${homeP}% vs ${awayTeam} ${awayP}% using ${sportContext[sport]}. The best available line is ${bestBet} with an EV of ${evStr}. The market is fairly priced here — size this bet cautiously and consider line shopping before committing.`;
}

export async function runVitAnalysis(
  sport: Sport,
  homeTeam: string,
  awayTeam: string,
  league: string = "EPL",
  season: number = 2024,
): Promise<VitResult> {
  const startTime = Date.now();

  const python = await callPythonModel(sport, homeTeam, awayTeam, league, season);

  const homeWinProb = round4(python.home_win);
  const awayWinProb = round4(python.away_win);
  const drawProb = python.draw != null ? round4(python.draw) : null;
  const predictedHomeScore = python.predicted_home_score;
  const predictedAwayScore = python.predicted_away_score;
  const scoreSimulations = python.score_simulations.map((s) => ({
    home: s.home,
    away: s.away,
    probability: round4(s.probability),
  }));

  let marketPredictions: MarketPrediction[];
  if (sport === "football") {
    marketPredictions = buildFootballMarkets(
      homeWinProb, drawProb ?? 0, awayWinProb,
      predictedHomeScore ?? 1.2, predictedAwayScore ?? 1.0,
    );
  } else if (sport === "basketball") {
    marketPredictions = buildBasketballMarkets(
      homeWinProb, awayWinProb,
      predictedHomeScore ?? 110, predictedAwayScore ?? 107,
    );
  } else {
    marketPredictions = buildTennisMarkets(homeWinProb, awayWinProb);
  }

  const bestMarket = [...marketPredictions].sort((a, b) => b.ev - a.ev)[0];
  const bestBet = bestMarket.prediction;
  const bestBetEv = round4(bestMarket.ev);
  const bestBetConfidence = round4(bestMarket.confidence);
  const valueRating = getValueRating(bestBetEv);

  const aiConsensus = generateConsensus(
    sport, homeTeam, awayTeam,
    homeWinProb, awayWinProb, drawProb,
    bestBet, bestBetEv, valueRating,
    python.model_meta,
  );

  return {
    homeTeam,
    awayTeam,
    homeWinProb,
    drawProb,
    awayWinProb,
    predictedHomeScore,
    predictedAwayScore,
    bestBet,
    bestBetEv,
    bestBetConfidence,
    valueRating,
    aiConsensus,
    marketPredictions,
    scoreSimulations,
    processingTimeMs: Date.now() - startTime,
  };
}
