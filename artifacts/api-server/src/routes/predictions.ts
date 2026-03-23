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

  const result = await runVitAnalysis(sport as Sport, homeTeam, awayTeam);

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

type TicketFixtureMarket = "home_win" | "draw" | "away_win" | "over_2_5" | "btts";

type TicketFixture = {
  sport: Sport;
  home: string;
  away: string;
  market: TicketFixtureMarket;
};

type TicketMatchResult = {
  match: string;
  market: TicketFixtureMarket;
  probability: number;
  odds: number;
  ev: number;
  value: "GOOD" | "NO VALUE";
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
      const prob = round2(getMarketProbability(prediction, fixture.market));
      const odds = round2(getMarketOdds(prediction, fixture.market, prob));
      const ev = round2(prob * odds - 1);
      const value = getValueLabel(ev);

      combinedProbability *= prob;
      combinedOdds *= odds;

      ticketResults.push({
        match: `${fixture.home} vs ${fixture.away}`,
        market: fixture.market,
        probability: prob,
        odds,
        ev,
        value,
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
