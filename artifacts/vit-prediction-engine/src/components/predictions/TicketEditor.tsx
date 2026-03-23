import { useState } from "react";
import { Button, Input, Badge } from "@/components/ui";
import { Plus, Trash2, Search } from "lucide-react";

type MarketOption = "home_win" | "draw" | "away_win" | "over_2_5" | "btts";

type TicketFixture = {
  sport: "football" | "basketball" | "tennis";
  home: string;
  away: string;
  market: MarketOption;
};

type TicketMatchResult = {
  match: string;
  market: MarketOption;
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

const emptyFixture: TicketFixture = {
  sport: "football",
  home: "",
  away: "",
  market: "home_win",
};

const marketLabels: Record<MarketOption, string> = {
  home_win: "Home Win",
  draw: "Draw",
  away_win: "Away Win",
  over_2_5: "Over 2.5",
  btts: "BTTS",
};

export function TicketEditor() {
  const [fixtures, setFixtures] = useState<TicketFixture[]>([emptyFixture]);
  const [results, setResults] = useState<TicketMatchResult[]>([]);
  const [summary, setSummary] = useState<TicketSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateFixture = (index: number, changes: Partial<TicketFixture>) => {
    setFixtures((prev) => prev.map((f, i) => (i === index ? { ...f, ...changes } : f)));
  };

  const addFixture = () => setFixtures((prev) => [...prev, emptyFixture]);
  const removeFixture = (index: number) =>
    setFixtures((prev) => prev.filter((_, i) => i !== index));

  const analyzeTicket = async () => {
    if (fixtures.length === 0) {
      setError("Add at least 1 fixture before analyzing.");
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fixtures),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Ticket analysis failed");
      }

      const data = await response.json();
      setResults(data.matches ?? []);
      setSummary(data.ticket_summary ?? null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="mt-8 p-5 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold">Ticket Editor & Analysis</h3>
        <Button onClick={addFixture} variant="secondary" size="sm">
          <Plus className="mr-2 h-4 w-4" /> Add fixture
        </Button>
      </div>

      <div className="space-y-3">
        {fixtures.map((fixture, idx) => (
          <div key={`${fixture.home}-${fixture.away}-${idx}`} className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
            <div>
              <label className="text-xs uppercase text-muted-foreground">Sport</label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background/50 px-3 text-sm"
                value={fixture.sport}
                onChange={(e) => updateFixture(idx, { sport: e.target.value as TicketFixture["sport"] })}
              >
                <option value="football">Football</option>
                <option value="basketball">Basketball</option>
                <option value="tennis">Tennis</option>
              </select>
            </div>

            <div>
              <label className="text-xs uppercase text-muted-foreground">Home team</label>
              <Input value={fixture.home} onChange={(e) => updateFixture(idx, { home: e.target.value })} />
            </div>

            <div>
              <label className="text-xs uppercase text-muted-foreground">Away team</label>
              <Input value={fixture.away} onChange={(e) => updateFixture(idx, { away: e.target.value })} />
            </div>

            <div>
              <label className="text-xs uppercase text-muted-foreground">Market</label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background/50 px-3 text-sm"
                value={fixture.market}
                onChange={(e) => updateFixture(idx, { market: e.target.value as MarketOption })}
              >
                {Object.entries(marketLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                onClick={() => removeFixture(idx)}
                disabled={fixtures.length === 1}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={analyzeTicket} disabled={isLoading}>
          <Search className="mr-2 h-4 w-4" /> Analyze Ticket
        </Button>
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {summary && (
        <div className="mt-6 grid gap-3 grid-cols-1 md:grid-cols-5">
          {Object.entries(summary).map(([key, value]) => (
            <div key={key} className="p-3 bg-slate-900/40 border border-white/10 rounded-lg">
              <span className="text-xs uppercase text-muted-foreground">{key.replace("_", " ")}</span>
              <div className="text-lg font-semibold">{value}</div>
            </div>
          ))}
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-6 overflow-auto rounded-lg border border-white/10">
          <table className="min-w-full text-left">
            <thead className="bg-white/10">
              <tr>
                <th className="px-3 py-2">Match</th>
                <th className="px-3 py-2">Market</th>
                <th className="px-3 py-2">Probability</th>
                <th className="px-3 py-2">Odds</th>
                <th className="px-3 py-2">EV</th>
                <th className="px-3 py-2">Value</th>
              </tr>
            </thead>
            <tbody>
              {results.map((row) => (
                <tr key={`${row.match}-${row.market}`} className="even:bg-white/5 odd:bg-transparent">
                  <td className="px-3 py-2">{row.match}</td>
                  <td className="px-3 py-2">{marketLabels[row.market]}</td>
                  <td className="px-3 py-2">{(row.probability * 100).toFixed(1)}%</td>
                  <td className="px-3 py-2">{row.odds.toFixed(2)}</td>
                  <td className="px-3 py-2">{row.ev.toFixed(2)}</td>
                  <td className="px-3 py-2">
                    <Badge variant={row.value === "GOOD" ? "success" : "secondary"}>{row.value}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
