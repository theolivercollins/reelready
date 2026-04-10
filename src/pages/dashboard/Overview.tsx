import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Activity, Clock, DollarSign, CheckCircle2, AlertTriangle, Layers } from "lucide-react";
import { Link } from "react-router-dom";
import {
  completedProperties, inProgressProperties, dailyStats, hourlyThroughput,
  getStatusColor, formatCents, formatDuration, getRelativeTime
} from "@/lib/mock-data";

const statCards = [
  {
    label: "Today's Properties",
    value: `${dailyStats[6]?.properties_completed || 0}`,
    sub: `of ${(dailyStats[6]?.properties_completed || 0) + 3} submitted`,
    icon: Layers,
    color: "text-primary",
  },
  {
    label: "In Pipeline",
    value: `${inProgressProperties.length}`,
    sub: "currently processing",
    icon: Activity,
    color: "text-info",
  },
  {
    label: "Avg Processing Time",
    value: formatDuration(dailyStats[6]?.avg_processing_time_ms || 0),
    sub: "per video",
    icon: Clock,
    color: "text-muted-foreground",
  },
  {
    label: "Success Rate",
    value: `${Math.round((1 - (dailyStats[6]?.properties_failed || 0) / Math.max(1, (dailyStats[6]?.properties_completed || 1))) * 100)}%`,
    sub: "auto-completed",
    icon: CheckCircle2,
    color: "text-primary",
  },
  {
    label: "Today's Cost",
    value: formatCents(dailyStats[6]?.total_cost_cents || 0),
    sub: `${dailyStats[6]?.total_clips_generated || 0} clips`,
    icon: DollarSign,
    color: "text-warning",
  },
  {
    label: "Avg Cost/Video",
    value: formatCents(dailyStats[6]?.avg_cost_per_video_cents || 0),
    sub: "per property",
    icon: AlertTriangle,
    color: "text-muted-foreground",
  },
];

const Overview = () => {
  const statusToProgress: Record<string, number> = {
    queued: 0, analyzing: 15, scripting: 35, generating: 55, qc: 80, assembling: 90, complete: 100,
  };

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
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={hourlyThroughput}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="hour" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                />
                <Area type="monotone" dataKey="completed" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <h3 className="text-sm font-medium mb-4">Daily Cost (7d)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dailyStats}>
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
              {inProgressProperties.map(prop => (
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
              {completedProperties.slice(0, 10).map(prop => (
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
