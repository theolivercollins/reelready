import { useState } from "react";
import { Loader2, Gavel } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";

type RunState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; data: unknown; elapsedMs: number }
  | { status: "error"; message: string };

async function callJson(path: string, init?: RequestInit): Promise<{ data: unknown; elapsedMs: number }> {
  // Admin endpoints gate on Authorization: Bearer <supabase access token>,
  // matching the pattern in src/lib/devApi.ts / promptLabApi.ts. Pull the
  // current session and attach it.
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = {};
  if (init?.body) headers["Content-Type"] = "application/json";
  if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;

  const t0 = performance.now();
  const res = await fetch(path, { ...init, headers });
  const elapsedMs = Math.round(performance.now() - t0);
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = (data && typeof data === "object" && "error" in data && typeof (data as { error?: unknown }).error === "string")
      ? (data as { error: string }).error
      : `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return { data, elapsedMs };
}

function JsonView({ value }: { value: unknown }) {
  return (
    <pre className="mt-3 max-h-[480px] overflow-auto border border-border bg-muted/30 p-4 text-[11px] leading-relaxed">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="border border-border bg-background p-6">
      <div className="mb-4 flex items-start justify-between gap-6">
        <div>
          <span className="label text-muted-foreground">{title}</span>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function JudgeSmoke() {
  const [iterationId, setIterationId] = useState("");
  const [cellKey, setCellKey] = useState("kitchen-push_in");
  const [sampleCap, setSampleCap] = useState("10");

  const [scoreState, setScoreState] = useState<RunState>({ status: "idle" });
  const [calibrateState, setCalibrateState] = useState<RunState>({ status: "idle" });
  const [statusState, setStatusState] = useState<RunState>({ status: "idle" });

  async function runScore() {
    if (!iterationId.trim()) return;
    setScoreState({ status: "loading" });
    try {
      const { data, elapsedMs } = await callJson("/api/admin/judge/score", {
        method: "POST",
        body: JSON.stringify({ iteration_id: iterationId.trim() }),
      });
      setScoreState({ status: "ok", data, elapsedMs });
    } catch (err) {
      setScoreState({ status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function runCalibrate() {
    if (!cellKey.trim()) return;
    setCalibrateState({ status: "loading" });
    try {
      const cap = Number(sampleCap);
      const { data, elapsedMs } = await callJson("/api/admin/judge/calibrate", {
        method: "POST",
        body: JSON.stringify({
          cell_keys: [cellKey.trim()],
          per_cell_sample_cap: Number.isFinite(cap) && cap > 0 ? cap : 10,
        }),
      });
      setCalibrateState({ status: "ok", data, elapsedMs });
    } catch (err) {
      setCalibrateState({ status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function runStatus() {
    setStatusState({ status: "loading" });
    try {
      const { data, elapsedMs } = await callJson("/api/admin/judge/status");
      setStatusState({ status: "ok", data, elapsedMs });
    } catch (err) {
      setStatusState({ status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <div className="space-y-10">
      <div>
        <span className="label text-muted-foreground">— Judge smoke test</span>
        <h2 className="mt-3 flex items-center gap-3 text-3xl font-semibold tracking-[-0.02em]">
          <Gavel className="h-6 w-6 text-muted-foreground" />
          Phase 1 Claude rubric judge
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Exercise the new judge without touching a terminal. Score a single rated iteration, run a narrow calibration on one cell, or read the current calibration status across all cells. All three hit the admin endpoints (<code className="font-mono text-xs">/api/admin/judge/*</code>) with your logged-in session.
        </p>
      </div>

      <Section
        title="1. Score an iteration"
        description="Runs scoreIteration — fetches neighbors, calls Claude Sonnet 4.6, parses the rubric, upserts to lab_judge_scores. Idempotent. ~$0.01–0.03 per call."
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex-1 space-y-2">
            <label className="text-xs text-muted-foreground">Iteration ID</label>
            <Input
              value={iterationId}
              onChange={(e) => setIterationId(e.target.value)}
              placeholder="uuid of a rated iteration from Prompt Lab"
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Grab one by opening a session in Prompt Lab — the URL path ends in the session id; iteration ids come back from the API.
            </p>
          </div>
          <Button onClick={runScore} disabled={scoreState.status === "loading" || !iterationId.trim()}>
            {scoreState.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Score"}
          </Button>
        </div>
        {scoreState.status === "error" && (
          <p className="mt-3 text-xs text-destructive">Error: {scoreState.message}</p>
        )}
        {scoreState.status === "ok" && (
          <>
            <p className="mt-3 text-[11px] text-muted-foreground">{scoreState.elapsedMs}ms</p>
            <JsonView value={scoreState.data} />
          </>
        )}
      </Section>

      <Section
        title="2. Calibrate one cell"
        description="Runs the judge across all human-rated iterations in the chosen cell (up to the sample cap). Writes a snapshot to lab_judge_calibrations. Keep to one cell at a time — Vercel serverless functions time out at 60s."
      >
        <div className="grid gap-3 md:grid-cols-[1fr_120px_auto] md:items-end">
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Cell key</label>
            <Input
              value={cellKey}
              onChange={(e) => setCellKey(e.target.value)}
              placeholder="e.g. kitchen-push_in"
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Sample cap</label>
            <Input
              value={sampleCap}
              onChange={(e) => setSampleCap(e.target.value)}
              type="number"
              min={1}
              max={30}
              className="font-mono text-xs"
            />
          </div>
          <Button onClick={runCalibrate} disabled={calibrateState.status === "loading" || !cellKey.trim()}>
            {calibrateState.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Calibrate"}
          </Button>
        </div>
        {calibrateState.status === "error" && (
          <p className="mt-3 text-xs text-destructive">Error: {calibrateState.message}</p>
        )}
        {calibrateState.status === "ok" && (
          <>
            <p className="mt-3 text-[11px] text-muted-foreground">{calibrateState.elapsedMs}ms</p>
            <JsonView value={calibrateState.data} />
          </>
        )}
      </Section>

      <Section
        title="3. Read calibration status"
        description="Pulls v_judge_calibration_status — the latest calibration snapshot per cell, plus an aggregate summary including the sample-weighted within-one-star agreement and the number of cells in auto vs advisory mode."
      >
        <Button onClick={runStatus} disabled={statusState.status === "loading"}>
          {statusState.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Status"}
        </Button>
        {statusState.status === "error" && (
          <p className="mt-3 text-xs text-destructive">Error: {statusState.message}</p>
        )}
        {statusState.status === "ok" && (
          <>
            <p className="mt-3 text-[11px] text-muted-foreground">{statusState.elapsedMs}ms</p>
            <JsonView value={statusState.data} />
          </>
        )}
      </Section>
    </div>
  );
}
