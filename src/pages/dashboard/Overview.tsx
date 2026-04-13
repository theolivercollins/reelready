import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Loader2, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { formatCents, formatDuration, getRelativeTime } from "@/lib/types";
import type { Property, PropertyStatus, DailyStat } from "@/lib/types";
import { fetchProperties, fetchDailyStats, fetchStatsOverview } from "@/lib/api";

const statusToProgress: Record<string, number> = {
  queued: 0, analyzing: 15, scripting: 35, generating: 55, qc: 80, assembling: 90, complete: 100,
};

// Editorial dot+label status pill — cool, dense, operator-grade
const STATUS_TONE: Record<string, string> = {
  complete: "text-foreground",
  queued: "text-muted-foreground",
  analyzing: "text-accent",
  scripting: "text-accent",
  generating: "text-accent",
  qc: "text-accent",
  assembling: "text-accent",
  failed: "text-destructive",
  needs_review: "text-destructive",
};

const STATUS_DOT: Record<string, string> = {
  complete: "bg-foreground",
  queued: "bg-muted-foreground",
  analyzing: "bg-accent",
  scripting: "bg-accent",
  generating: "bg-accent",
  qc: "bg-accent",
  assembling: "bg-accent",
  failed: "bg-destructive",
  needs_review: "bg-destructive",
};

function StatusPill({ status }: { status: PropertyStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.15em] ${
        STATUS_TONE[status] ?? "text-muted-foreground"
      }`}
    >
      <span className={`h-1.5 w-1.5 ${STATUS_DOT[status] ?? "bg-muted-foreground"}`} />
      {status.replace(/_/g, " ")}
    </span>
  );
}

const Overview = () => {
  const [completedProps, setCompletedProps] = useState<Property[]>([]);
  const [inProgressProps, setInProgressProps] = useState<Property[]>([]);
  const [dailyStatsData, setDailyStatsData] = useState<DailyStat[]>([]);
  const [stats, setStats] = useState<{
    completedToday: number; submittedToday: number; inPipeline: number; needsReview: number;
    avgProcessingMs: number; totalCostTodayCents: number; avgCostPerVideoCents: number; successRate: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [completedRes, inProgressRes, dailyRes, overviewRes] = await Promise.all([
          fetchProperties({ status: "complete", limit: 10 }),
          fetchProperties({ limit: 50 }),
          fetchDailyStats(7),
          fetchStatsOverview(),
        ]);
        if (cancelled) return;
        setCompletedProps(completedRes.properties);
        const activeStatuses = new Set(["queued", "analyzing", "scripting", "generating", "qc", "assembling"]);
        setInProgressProps(inProgressRes.properties.filter(p => activeStatuses.has(p.status)));
        setDailyStatsData(dailyRes.stats);
        setStats(overviewRes);
        setError(null);
      } catch (err: any) {
        if (cancelled) return;
        setError(err.message || "Failed to load dashboard data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-32">
        <AlertTriangle className="h-6 w-6 text-destructive" />
        <p className="label text-destructive">{error}</p>
      </div>
    );
  }

  // Operational first, financial last
  const statCards = [
    {
      label: "Today's properties",
      value: `${stats?.completedToday ?? 0}`,
      sub: `of ${stats?.submittedToday ?? 0} submitted today`,
    },
    {
      label: "In pipeline",
      value: `${stats?.inPipeline ?? 0}`,
      sub: "currently processing",
    },
    {
      label: "Avg processing time",
      value: formatDuration(stats?.avgProcessingMs ?? 0),
      sub: "per video, last 7 days",
    },
    {
      label: "Success rate",
      value: `${Math.round((stats?.successRate ?? 0) * 100)}%`,
      sub: "auto-completed",
    },
    {
      label: "Today's cost",
      value: formatCents(stats?.totalCostTodayCents ?? 0),
      sub: "total spend",
    },
    {
      label: "Avg cost / video",
      value: formatCents(stats?.avgCostPerVideoCents ?? 0),
      sub: "per property",
    },
  ];

  const dateLabel = now.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="space-y-20">
      {/* ─── Header ─── */}
      <header className="flex items-end justify-between gap-6">
        <div>
          <span className="label text-muted-foreground">— Operations</span>
          <h1 className="display-md mt-5 text-foreground">Overview.</h1>
        </div>
        <span className="label tabular hidden text-muted-foreground md:inline">{dateLabel}</span>
      </header>

      {/* ─── Stat grid ─── */}
      <section className="grid grid-cols-1 gap-px border border-border bg-border md:grid-cols-2 lg:grid-cols-3">
        {statCards.map(stat => (
          <div
            key={stat.label}
            className="group relative bg-background p-8 transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-foreground/30"
          >
            <span className="label text-muted-foreground">{stat.label}</span>
            <p className="display-md font-mono mt-6 text-foreground">{stat.value}</p>
            <p className="mt-3 text-xs text-muted-foreground">{stat.sub}</p>
          </div>
        ))}
      </section>

      {/* ─── Charts ─── */}
      <section className="grid gap-px border border-border bg-border md:grid-cols-2">
        <div className="bg-background p-8">
          <span className="label text-muted-foreground">— Throughput coming soon</span>
          <div className="mt-6 flex h-[220px] items-end">
            <div className="flex h-full w-full flex-col justify-end gap-px opacity-30">
              {[12, 18, 8, 22, 16, 28, 14, 20, 10, 24, 18, 30].map((h, i) => (
                <div key={i} className="w-full" style={{ height: 0 }} />
              ))}
              <div className="h-px w-full bg-border" />
            </div>
          </div>
        </div>
        <div className="bg-background p-8">
          <span className="label text-muted-foreground">— Daily cost / 7d</span>
          <div className="mt-6 h-[220px]">
            {dailyStatsData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyStatsData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    stroke="hsl(var(--border))"
                    tickFormatter={(v: string) => v.slice(5)}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    stroke="hsl(var(--border))"
                    tickFormatter={(v: number) => `$${(v / 100).toFixed(0)}`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--background))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 0,
                      fontSize: 11,
                      fontFamily: "Inter",
                    }}
                    cursor={{ fill: "hsl(var(--muted))" }}
                    formatter={(v: number) => formatCents(v)}
                  />
                  <Bar dataKey="total_cost_cents" fill="hsl(var(--accent))" radius={0} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center">
                <span className="label text-muted-foreground">No data yet</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ─── Active pipeline ─── */}
      <section>
        <div className="mb-6 flex items-end justify-between">
          <span className="label text-muted-foreground">— Active pipeline</span>
          <span className="label tabular text-muted-foreground">{inProgressProps.length} in flight</span>
        </div>
        <div className="border-t border-border">
          <div className="hidden grid-cols-[2fr_1fr_1fr_120px_120px] gap-6 border-b border-border py-3 md:grid">
            <span className="label text-muted-foreground">Address</span>
            <span className="label text-muted-foreground">Stage</span>
            <span className="label text-muted-foreground">Progress</span>
            <span className="label text-right text-muted-foreground">Started</span>
            <span className="label text-right text-muted-foreground">Est. left</span>
          </div>
          {inProgressProps.length === 0 ? (
            <div className="border-b border-border py-12 text-center">
              <span className="label text-muted-foreground">No properties currently in pipeline</span>
            </div>
          ) : (
            inProgressProps.map(prop => (
              <div
                key={prop.id}
                className="grid cursor-pointer grid-cols-1 gap-3 border-b border-border py-5 transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-muted/40 md:grid-cols-[2fr_1fr_1fr_120px_120px] md:items-center md:gap-6"
              >
                <Link
                  to={`/dashboard/properties/${prop.id}`}
                  className="text-sm font-medium text-foreground transition-colors hover:text-accent"
                >
                  {prop.address}
                </Link>
                <div><StatusPill status={prop.status} /></div>
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-border">
                    <div
                      className="h-px bg-accent transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
                      style={{ width: `${statusToProgress[prop.status] ?? 0}%` }}
                    />
                  </div>
                  <span className="font-mono tabular text-[10px] text-muted-foreground">
                    {statusToProgress[prop.status] ?? 0}%
                  </span>
                </div>
                <span className="font-mono tabular text-[11px] text-muted-foreground md:text-right">
                  {getRelativeTime(prop.created_at)}
                </span>
                <span className="font-mono tabular text-[11px] text-muted-foreground md:text-right">~2m</span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* ─── Recent completions ─── */}
      <section>
        <div className="mb-6 flex items-end justify-between">
          <span className="label text-muted-foreground">— Recent completions</span>
          <Link to="/dashboard/properties" className="label text-muted-foreground transition-colors hover:text-foreground">
            All properties →
          </Link>
        </div>
        <div className="border-t border-border">
          <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-6 border-b border-border py-3 md:grid">
            <span className="label text-muted-foreground">Address</span>
            <span className="label text-muted-foreground">Completed</span>
            <span className="label text-muted-foreground">Time</span>
            <span className="label text-muted-foreground">Cost</span>
            <span className="label text-muted-foreground">Status</span>
          </div>
          {completedProps.length === 0 ? (
            <div className="border-b border-border py-12 text-center">
              <span className="label text-muted-foreground">No completed properties yet</span>
            </div>
          ) : (
            completedProps.slice(0, 10).map(prop => (
              <Link
                key={prop.id}
                to={`/dashboard/properties/${prop.id}`}
                className="grid grid-cols-1 gap-3 border-b border-border py-5 transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-muted/40 md:grid-cols-[2fr_1fr_1fr_1fr_1fr] md:items-center md:gap-6"
              >
                <span className="text-sm font-medium text-foreground">{prop.address}</span>
                <span className="font-mono tabular text-[11px] text-muted-foreground">
                  {getRelativeTime(prop.updated_at)}
                </span>
                <span className="font-mono tabular text-[11px] text-foreground">
                  {formatDuration(prop.processing_time_ms)}
                </span>
                <span className="font-mono tabular text-[11px] text-foreground">
                  {formatCents(prop.total_cost_cents)}
                </span>
                <StatusPill status={prop.status} />
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
};

export default Overview;
