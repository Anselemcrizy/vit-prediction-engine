import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, predictionsTable } from "@workspace/db";
import {
  ListPredictionsResponse,
  GetPredictionResponse,
  GetPredictionParams,
  DeletePredictionParams,
  CreatePredictionBody,
} from "@workspace/api-zod";
import { runVitAnalysis, type Sport } from "../lib/vit-engine.js";

const router: IRouter = Router();

router.get("/predictions", async (_req, res): Promise<void> => {
  const predictions = await db
    .select()
    .from(predictionsTable)
    .orderBy(desc(predictionsTable.createdAt));
  res.json(ListPredictionsResponse.parse(predictions));
});

router.post("/predictions", async (req, res): Promise<void> => {
  const parsed = CreatePredictionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { sport, homeTeam, awayTeam, league, matchDate } = parsed.data;

  const result = await runVitAnalysis(
    sport as Sport,
    homeTeam,
    awayTeam,
    league ?? "EPL",
    2024 // Default season, can be made configurable later
  );

  console.log('POST /predictions: DATABASE_URL', process.env.DATABASE_URL);

  if (!process.env.DATABASE_URL) {
    console.log('No DB branch');
    // Development mode: skip DB persistence when DATABASE_URL is not provided
    res.status(201).json(
      GetPredictionResponse.parse({
        id: 0,
        createdAt: new Date(),
        sport,
        homeTeam,
        awayTeam,
        league: league ?? null,
        matchDate: matchDate ?? null,
        homeWinProb: result.homeWinProb,
        drawProb: result.drawProb,
        awayWinProb: result.awayWinProb,
        predictedHomeScore: result.predictedHomeScore,
        predictedAwayScore: result.predictedAwayScore,
        bestBet: result.bestBet,
        bestBetEv: result.bestBetEv,
        bestBetConfidence: result.bestBetConfidence,
        valueRating: result.valueRating,
        aiConsensus: result.aiConsensus,
        marketPredictions: result.marketPredictions,
        scoreSimulations: result.scoreSimulations,
        processingTimeMs: result.processingTimeMs,
      }),
    );
    return;
  }

  const [prediction] = await db
    .insert(predictionsTable)
    .values({
      sport,
      homeTeam,
      awayTeam,
      league: league ?? null,
      matchDate: matchDate ?? null,
      homeWinProb: result.homeWinProb,
      drawProb: result.drawProb,
      awayWinProb: result.awayWinProb,
      predictedHomeScore: result.predictedHomeScore,
      predictedAwayScore: result.predictedAwayScore,
      bestBet: result.bestBet,
      bestBetEv: result.bestBetEv,
      bestBetConfidence: result.bestBetConfidence,
      valueRating: result.valueRating,
      aiConsensus: result.aiConsensus,
      marketPredictions: result.marketPredictions,
      scoreSimulations: result.scoreSimulations,
      processingTimeMs: result.processingTimeMs,
    })
    .returning();

  res.status(201).json(GetPredictionResponse.parse(prediction));
});

router.get("/predictions/:id", async (req, res): Promise<void> => {
  const params = GetPredictionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [prediction] = await db
    .select()
    .from(predictionsTable)
    .where(eq(predictionsTable.id, params.data.id));

  if (!prediction) {
    res.status(404).json({ error: "Prediction not found" });
    return;
  }

  res.json(GetPredictionResponse.parse(prediction));
});

type TicketFixtureMarket = "home_win" | "draw" | "away_win" | "over_2_5" | "btts" | "player_rebounds_over" | "player_assists_over";

type TicketFixture = {
  sport: Sport;
  home: string;
  away: string;
  market: TicketFixtureMarket;
  player?: string;
  line?: number;
};

type TicketMatchResult = {
  match: string;
  market: TicketFixtureMarket;
  player?: string;
  line?: number;
  probability: number;
  odds: number;
  ev: number;
  value: "GOOD" | "NO VALUE";
  insights: string[];
};

type TicketSummary = {
  total_matches: number;
  combined_probability: number;
  combined_odds: number;
  ticket_ev: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  risk: "LOW" | "MEDIUM" | "HIGH";
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

// Player stats database (mock data for now)
const playerStats: Record<string, {
  avg_rebounds: number;
  avg_assists: number;
  std_dev_rebounds: number;
  std_dev_assists: number;
  minutes: number;
  usage_rate: number;
  team: string;
}> = {
  "Luka Doncic": {
    avg_rebounds: 8.3,
    avg_assists: 7.8,
    std_dev_rebounds: 2.1,
    std_dev_assists: 2.5,
    minutes: 36,
    usage_rate: 32,
    team: "Dallas Mavericks"
  },
  "Domantas Sabonis": {
    avg_rebounds: 12.1,
    avg_assists: 6.2,
    std_dev_rebounds: 2.8,
    std_dev_assists: 1.9,
    minutes: 35,
    usage_rate: 25,
    team: "Sacramento Kings"
  },
  "Nikola Jokic": {
    avg_rebounds: 11.5,
    avg_assists: 7.2,
    std_dev_rebounds: 2.5,
    std_dev_assists: 2.1,
    minutes: 34,
    usage_rate: 28,
    team: "Denver Nuggets"
  },
  "Paolo Banchero": {
    avg_rebounds: 6.8,
    avg_assists: 4.1,
    std_dev_rebounds: 1.8,
    std_dev_assists: 1.5,
    minutes: 33,
    usage_rate: 22,
    team: "Orlando Magic"
  },
  "Darius Garland": {
    avg_rebounds: 2.5,
    avg_assists: 6.8,
    std_dev_rebounds: 1.2,
    std_dev_assists: 2.2,
    minutes: 32,
    usage_rate: 24,
    team: "Cleveland Cavaliers"
  },
  "Jalen Johnson": {
    avg_rebounds: 7.2,
    avg_assists: 2.8,
    std_dev_rebounds: 2.0,
    std_dev_assists: 1.1,
    minutes: 30,
    usage_rate: 18,
    team: "Atlanta Hawks"
  }
};

// Normal distribution CDF approximation
function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - prob : prob;
}

function calculatePlayerPropProbability(
  player: string,
  market: "player_rebounds_over" | "player_assists_over",
  line: number,
  opponent: string
): { probability: number; insights: string[] } {
  const stats = playerStats[player];
  if (!stats) {
    return { probability: 0.5, insights: ["Player stats not available"] };
  }

  const isRebounds = market === "player_rebounds_over";
  const mean = isRebounds ? stats.avg_rebounds : stats.avg_assists;
  const std = isRebounds ? stats.std_dev_rebounds : stats.std_dev_assists;

  // Context adjustments
  let adjustedMean = mean;

  // Pace factor (simplified)
  const paceFactor = opponent.includes("Lakers") || opponent.includes("Warriors") ? 0.05 : -0.02;
  adjustedMean *= (1 + paceFactor);

  // Opponent factor (simplified)
  const opponentReboundRank = opponent.includes("Kings") || opponent.includes("Nuggets") ? 0.08 : -0.03;
  if (isRebounds) {
    adjustedMean *= (1 + opponentReboundRank);
  }

  // Minutes projection (simplified)
  const minutesProjection = Math.min(stats.minutes, 38);
  adjustedMean *= (minutesProjection / stats.minutes);

  // Calculate probability
  const z = (line - adjustedMean) / std;
  const probability = 1 - normalCDF(z);

  // Generate insights
  const insights = [
    `Averaging ${mean.toFixed(1)} ${isRebounds ? 'rebounds' : 'assists'} this season`,
    `Projected ${minutesProjection.toFixed(0)} minutes in this matchup`,
    `${paceFactor > 0 ? 'High' : 'Low'} pace matchup (${(paceFactor * 100).toFixed(0)}% adjustment)`,
    `${isRebounds ? 'Opponent ranks ' + (opponentReboundRank > 0 ? 'poor' : 'strong') + ' in rebounding allowed' : 'Usage rate: ' + stats.usage_rate + '%'}`
  ];

  return { probability: round4(probability), insights };
}

function getMarketProbability(prediction: any, market: TicketFixtureMarket): number {
  switch (market) {
    case "home_win":
      return prediction.homeWinProb;
    case "draw":
      return prediction.drawProb ?? 0;
    case "away_win":
      return prediction.awayWinProb;
    case "over_2_5": {
      const marketRow = prediction.marketPredictions?.find((m: any) => m.market === "Over/Under 2.5");
      return marketRow?.confidence ?? 0;
    }
    case "btts": {
      const marketRow = prediction.marketPredictions?.find((m: any) => m.market === "BTTS");
      return marketRow?.confidence ?? 0;
    }
    default:
      return 0;
  }
}

function getMarketOdds(prediction: any, market: TicketFixtureMarket, prob: number): number {
  if (prob <= 0) {
    return 1.01;
  }

  if (market === "home_win" || market === "draw" || market === "away_win") {
    return round2(1 / Math.max(0.01, prob));
  }

  const lookup =
    market === "over_2_5"
      ? prediction.marketPredictions?.find((m: any) => m.market === "Over/Under 2.5")
      : market === "btts"
      ? prediction.marketPredictions?.find((m: any) => m.market === "BTTS")
      : undefined;

  if (lookup?.recommendedOdds && lookup.recommendedOdds > 1) {
    return lookup.recommendedOdds;
  }

  return round2(1 / Math.max(0.01, prob));
}

function getValueLabel(ev: number): "GOOD" | "NO VALUE" {
  return ev >= 0.1 ? "GOOD" : "NO VALUE";
}

function getTicketConfidence(avgProb: number): "HIGH" | "MEDIUM" | "LOW" {
  if (avgProb >= 0.65) return "HIGH";
  if (avgProb >= 0.40) return "MEDIUM";
  return "LOW";
}

function getTicketRisk(avgProb: number, combinedOdds: number): "LOW" | "MEDIUM" | "HIGH" {
  if (avgProb >= 0.6 && combinedOdds <= 3) return "LOW";
  if (avgProb <= 0.3 || combinedOdds >= 6) return "HIGH";
  return "MEDIUM";
}

router.post("/ticket", async (req, res): Promise<void> => {
  const fixtures = req.body as TicketFixture[];
  if (!Array.isArray(fixtures) || fixtures.length === 0) {
    res.status(400).json({ error: "Ticket must be a non-empty array of fixtures" });
    return;
  }

  const ticketResults: TicketMatchResult[] = [];

  try {
    const predictions = await Promise.all(
      fixtures.map((fixture) => runVitAnalysis(fixture.sport, fixture.home, fixture.away)),
    );

    let combinedProbability = 1;
    let combinedOdds = 1;

    predictions.forEach((prediction, index) => {
      const fixture = fixtures[index];
      let prob: number;
      let insights: string[] = [];

      if (fixture.market.startsWith("player_")) {
        if (!fixture.player || fixture.line === undefined) {
          throw new Error(`Player props require player and line: ${JSON.stringify(fixture)}`);
        }

        const result = calculatePlayerPropProbability(
          fixture.player,
          fixture.market as "player_rebounds_over" | "player_assists_over",
          fixture.line,
          fixture.away === prediction.awayTeam ? fixture.home : fixture.away
        );
        prob = result.probability;
        insights = result.insights;
      } else {
        prob = round2(getMarketProbability(prediction, fixture.market));
      }

      const odds = round2(getMarketOdds(prediction, fixture.market, prob));
      const ev = round2(prob * odds - 1);
      const value = getValueLabel(ev);

      combinedProbability *= prob;
      combinedOdds *= odds;

      ticketResults.push({
        match: `${fixture.home} vs ${fixture.away}`,
        market: fixture.market,
        player: fixture.player,
        line: fixture.line,
        probability: prob,
        odds,
        ev,
        value,
        insights,
      });
    });

    const totalMatches = ticketResults.length;
    const ticketEv = round2(combinedProbability * combinedOdds - 1);
    const avgProb = totalMatches > 0 ? ticketResults.reduce((acc, m) => acc + m.probability, 0) / totalMatches : 0;

    const ticketSummary: TicketSummary = {
      total_matches: totalMatches,
      combined_probability: round4(combinedProbability),
      combined_odds: round4(combinedOdds),
      ticket_ev: ticketEv,
      confidence: getTicketConfidence(avgProb),
      risk: getTicketRisk(avgProb, combinedOdds),
    };

    res.json({ ticket_summary: ticketSummary, matches: ticketResults });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message || "Ticket processing failed" });
  }
});

router.delete("/predictions/:id", async (req, res): Promise<void> => {
  const params = DeletePredictionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [prediction] = await db
    .delete(predictionsTable)
    .where(eq(predictionsTable.id, params.data.id))
    .returning();

  if (!prediction) {
    res.status(404).json({ error: "Prediction not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
