import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { AlertTriangle, Loader2, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { formatCents, formatDuration, getRelativeTime } from "@/lib/types";
import type { Property, DailyStat } from "@/lib/types";
import { fetchProperties, fetchDailyStats, fetchStatsOverview } from "@/lib/api";
import { motion } from "framer-motion";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const Overview = () => {
  const [completedProps, setCompletedProps] = useState<Property[]>([]);
  const [inProgressProps, setInProgressProps] = useState<Property[]>([]);
  const [dailyStatsData, setDailyStatsData] = useState<DailyStat[]>([]);
  const [stats, setStats] = useState<{
    completedToday: number;
    submittedToday: number;
    inPipeline: number;
    needsReview: number;
    avgProcessingMs: number;
    totalCostTodayCents: number;
    avgCostPerVideoCents: number;
    successRate: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        const active = new Set(["queued", "ingesting", "analyzing", "scripting", "generating", "qc", "assembling"]);
        setInProgressProps(inProgressRes.properties.filter((p) => active.has(p.status)));
        setDailyStatsData(dailyRes.stats);
        setStats(overviewRes);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-destructive/40 bg-destructive/5 p-10">
        <div className="flex items-start gap-5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-destructive/40 bg-destructive/10 text-destructive">
            <AlertTriangle className="h-5 w-5" strokeWidth={1.5} />
          </div>
          <div>
            <span className="label text-destructive">— Error</span>
            <p className="mt-3 text-sm text-muted-foreground">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const statusToProgress: Record<string, number> = {
    queued: 5,
    ingesting: 10,
    analyzing: 20,
    scripting: 35,
    generating: 60,
    qc: 80,
    assembling: 92,
    complete: 100,
  };

  const statCards = [
    { label: "Today", value: String(stats?.completedToday ?? 0).padStart(2, "0"), sub: `of ${stats?.submittedToday ?? 0} submitted` },
    { label: "In pipeline", value: String(stats?.inPipeline ?? 0).padStart(2, "0"), sub: "currently processing" },
    { label: "Avg time", value: formatDuration(stats?.avgProcessingMs ?? 0), sub: "per video" },
    { label: "Success", value: `${Math.round((stats?.successRate ?? 0) * 100)}%`, sub: "auto-completed" },
    { label: "Today's spend", value: formatCents(stats?.totalCostTodayCents ?? 0), sub: "all listings" },
    { label: "Avg / video", value: formatCents(stats?.avgCostPerVideoCents ?? 0), sub: "lifetime" },
  ];

  return (
    <div className="space-y-20">
      {/* KPI grid */}
      <section>
        <span className="label text-muted-foreground">— Today</span>
        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.02em]">Studio overview.</h2>

        <div className="mt-12 grid gap-px border border-border bg-border md:grid-cols-3">
          {statCards.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: i * 0.05, ease: EASE }}
              className="bg-background p-8"
            >
              <span className="label text-muted-foreground">{s.label}</span>
              <div className="tabular mt-6 text-4xl font-semibold tracking-[-0.03em]">{s.value}</div>
              <p className="mt-3 text-xs text-muted-foreground">{s.sub}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Cost chart */}
      <section>
        <div className="flex items-end justify-between">
          <div>
            <span className="label text-muted-foreground">— Trend</span>
            <h3 className="mt-3 text-xl font-semibold tracking-[-0.01em]">Daily spend, last 7 days</h3>
          </div>
        </div>
        <div className="mt-10 border border-border p-6">
          {dailyStatsData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={dailyStatsData}>
                <CartesianGrid strokeDasharray="0" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  stroke="hsl(var(--border))"
                  tickFormatter={(v) => v.slice(5)}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  stroke="hsl(var(--border))"
                  tickFormatter={(v) => `$${(v / 100).toFixed(0)}`}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  cursor={{ fill: "hsl(var(--secondary))" }}
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 0,
                    fontSize: 12,
                    padding: 12,
                  }}
                  formatter={(v: number) => formatCents(v)}
                />
                <Bar dataKey="total_cost_cents" fill="hsl(var(--accent))" radius={[0, 0, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
              No data yet
            </div>
          )}
        </div>
      </section>

      {/* Active pipeline */}
      <section>
        <div className="flex items-end justify-between">
          <div>
            <span className="label text-muted-foreground">— Active</span>
            <h3 className="mt-3 text-xl font-semibold tracking-[-0.01em]">In production</h3>
          </div>
          <Link to="/dashboard/pipeline" className="label inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground">
            View pipeline <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="mt-10 border-t border-border">
          <div className="grid grid-cols-[3fr_1.2fr_1.5fr_1fr] gap-6 border-b border-border py-4">
            <span className="label text-muted-foreground">Property</span>
            <span className="label text-muted-foreground">Stage</span>
            <span className="label text-muted-foreground">Progress</span>
            <span className="label text-right text-muted-foreground">Started</span>
          </div>
          {inProgressProps.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">No properties in pipeline</div>
          ) : (
            inProgressProps.map((p, i) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.03, ease: EASE }}
                className="grid grid-cols-[3fr_1.2fr_1.5fr_1fr] items-center gap-6 border-b border-border py-5 transition-colors duration-500 hover:bg-secondary/40"
              >
                <Link to={`/dashboard/properties/${p.id}`} className="truncate text-sm font-medium hover:underline">
                  {p.address}
                </Link>
                <span className="label text-foreground capitalize">{p.status.replace("_", " ")}</span>
                <div className="h-px w-full bg-border">
                  <motion.div
                    className="h-full bg-foreground"
                    initial={{ width: 0 }}
                    animate={{ width: `${statusToProgress[p.status] || 0}%` }}
                    transition={{ duration: 1, ease: EASE }}
                  />
                </div>
                <span className="tabular text-right text-xs text-muted-foreground">{getRelativeTime(p.created_at)}</span>
              </motion.div>
            ))
          )}
        </div>
      </section>

      {/* Recent completions */}
      <section>
        <div className="flex items-end justify-between">
          <div>
            <span className="label text-muted-foreground">— Recent</span>
            <h3 className="mt-3 text-xl font-semibold tracking-[-0.01em]">Delivered</h3>
          </div>
          <Link to="/dashboard/properties" className="label inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground">
            All listings <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="mt-10 border-t border-border">
          <div className="grid grid-cols-[3fr_1fr_1fr_1fr] gap-6 border-b border-border py-4">
            <span className="label text-muted-foreground">Property</span>
            <span className="label text-muted-foreground">Completed</span>
            <span className="label text-muted-foreground">Duration</span>
            <span className="label text-right text-muted-foreground">Cost</span>
          </div>
          {completedProps.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">No completed properties yet</div>
          ) : (
            completedProps.slice(0, 10).map((p, i) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.03, ease: EASE }}
                className="grid grid-cols-[3fr_1fr_1fr_1fr] items-center gap-6 border-b border-border py-5 transition-colors duration-500 hover:bg-secondary/40"
              >
                <Link to={`/dashboard/properties/${p.id}`} className="truncate text-sm font-medium hover:underline">
                  {p.address}
                </Link>
                <span className="tabular text-xs text-muted-foreground">{getRelativeTime(p.updated_at)}</span>
                <span className="tabular text-xs">{formatDuration(p.processing_time_ms)}</span>
                <span className="tabular text-right text-sm font-semibold">{formatCents(p.total_cost_cents)}</span>
              </motion.div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};

export default Overview;
