import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Activity, Clock, DollarSign, CheckCircle2, AlertTriangle, Layers, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { getStatusColor, formatCents, formatDuration, getRelativeTime } from "@/lib/types";
import type { Property, DailyStat } from "@/lib/types";
import { fetchProperties, fetchDailyStats, fetchStatsOverview } from "@/lib/api";

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
        // Filter for in-progress statuses
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

  const statusToProgress: Record<string, number> = {
    queued: 0, analyzing: 15, scripting: 35, generating: 55, qc: 80, assembling: 90, complete: 100,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-2">
          <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      label: "Today's Properties",
      value: `${stats?.completedToday ?? 0}`,
      sub: `of ${stats?.submittedToday ?? 0} submitted`,
      icon: Layers,
      color: "text-primary",
    },
    {
      label: "In Pipeline",
      value: `${stats?.inPipeline ?? 0}`,
      sub: "currently processing",
      icon: Activity,
      color: "text-info",
    },
    {
      label: "Avg Processing Time",
      value: formatDuration(stats?.avgProcessingMs ?? 0),
      sub: "per video",
      icon: Clock,
      color: "text-muted-foreground",
    },
    {
      label: "Success Rate",
      value: `${Math.round((stats?.successRate ?? 0) * 100)}%`,
      sub: "auto-completed",
      icon: CheckCircle2,
      color: "text-primary",
    },
    {
      label: "Today's Cost",
      value: formatCents(stats?.totalCostTodayCents ?? 0),
      sub: "total spend",
      icon: DollarSign,
      color: "text-warning",
    },
    {
      label: "Avg Cost/Video",
      value: formatCents(stats?.avgCostPerVideoCents ?? 0),
      sub: "per property",
      icon: AlertTriangle,
      color: "text-muted-foreground",
    },
  ];

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map(stat => (
          <Card key={stat.label}>
            <CardContent className="pt-4 pb-4 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{stat.label}</span>
                <stat.icon className={`h-3.5 w-3.5 ${stat.color}`} />
              </div>
              <div className="font-mono text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-5">
            <h3 className="text-sm font-medium mb-4">Pipeline Throughput (24h)</h3>
            <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
              Coming soon
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <h3 className="text-sm font-medium mb-4">Daily Cost (7d)</h3>
            {dailyStatsData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={dailyStatsData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={v => v.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `$${(v / 100).toFixed(0)}`} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => formatCents(v)}
                  />
                  <Bar dataKey="total_cost_cents" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                No data yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Active Pipeline */}
      <Card>
        <CardContent className="pt-5">
          <h3 className="text-sm font-medium mb-4">Active Pipeline</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Address</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Est. Remaining</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inProgressProps.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No properties currently in pipeline
                  </TableCell>
                </TableRow>
              )}
              {inProgressProps.map(prop => (
                <TableRow key={prop.id} className="cursor-pointer hover:bg-accent/50">
                  <TableCell className="font-medium text-sm">{prop.address}</TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(prop.status)} variant="secondary">{prop.status}</Badge>
                  </TableCell>
                  <TableCell className="w-32">
                    <Progress value={statusToProgress[prop.status] || 0} className="h-1.5" />
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {getRelativeTime(prop.created_at)}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">~2m</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Recent Completions */}
      <Card>
        <CardContent className="pt-5">
          <h3 className="text-sm font-medium mb-4">Recent Completions</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Address</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {completedProps.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No completed properties yet
                  </TableCell>
                </TableRow>
              )}
              {completedProps.slice(0, 10).map(prop => (
                <TableRow key={prop.id} className="cursor-pointer hover:bg-accent/50">
                  <TableCell>
                    <Link to={`/dashboard/properties/${prop.id}`} className="font-medium text-sm hover:underline">
                      {prop.address}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {getRelativeTime(prop.updated_at)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{formatDuration(prop.processing_time_ms)}</TableCell>
                  <TableCell className="font-mono text-xs">{formatCents(prop.total_cost_cents)}</TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(prop.status)} variant="secondary">{prop.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default Overview;
