import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Pause, Play, Download, Loader2 } from "lucide-react";
import type { PipelineLog, PipelineStage, LogLevel } from "@/lib/types";
import { fetchLogs } from "@/lib/api";

const Logs = () => {
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [logs, setLogs] = useState<(PipelineLog & { properties?: { address: string } })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const params: { limit: number; stage?: string; level?: string } = { limit: 500 };
        if (stageFilter !== "all") params.stage = stageFilter;
        if (levelFilter !== "all") params.level = levelFilter;
        const res = await fetchLogs(params);
        if (cancelled) return;
        setLogs(res.logs);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load logs");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [stageFilter, levelFilter]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const filtered = search ? logs.filter((l) => l.message.toLowerCase().includes(search.toLowerCase())) : logs;

  const getPropertyAddress = (log: PipelineLog & { properties?: { address: string } }) =>
    log.properties?.address?.split(",")[0] || "Unknown";

  const exportCSV = () => {
    const header = "Timestamp,Property,Stage,Level,Message\n";
    const rows = filtered
      .map((l) => `"${l.created_at}","${getPropertyAddress(l)}","${l.stage}","${l.level}","${l.message}"`)
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pipeline-logs.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-12">
      <div>
        <span className="label text-muted-foreground">— Telemetry</span>
        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.02em]">Pipeline logs</h2>
        <p className="mt-3 max-w-md text-sm text-muted-foreground">
          Live stream of every pipeline stage. Filter by stage or severity, search the message body, export to CSV.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[280px] flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            placeholder="Search log messages…"
            className="pl-11"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All stages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            {(["intake", "analysis", "scripting", "generation", "qc", "assembly", "delivery"] as PipelineStage[]).map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All levels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All levels</SelectItem>
            {(["info", "warn", "error", "debug"] as LogLevel[]).map((l) => (
              <SelectItem key={l} value={l}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => setAutoScroll(!autoScroll)}>
          {autoScroll ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {autoScroll ? "Pause" : "Resume"}
        </Button>
        <Button variant="outline" size="sm" onClick={exportCSV}>
          <Download className="h-3.5 w-3.5" /> Export CSV
        </Button>
      </div>

      {/* Log viewer */}
      <div className="border border-border bg-secondary/20">
        <div ref={scrollRef} className="h-[640px] overflow-y-auto">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center text-sm text-destructive">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No logs match your filters
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {filtered.map((log) => (
                <div
                  key={log.id}
                  className="grid grid-cols-[80px_140px_90px_60px_1fr] items-start gap-4 px-5 py-2.5 text-[11px] leading-relaxed transition-colors hover:bg-secondary"
                >
                  <span className="tabular text-muted-foreground/60">
                    {new Date(log.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                  <span className="truncate text-muted-foreground">{getPropertyAddress(log)}</span>
                  <span className="label text-muted-foreground">{log.stage}</span>
                  <span
                    className={`label ${
                      log.level === "error"
                        ? "text-destructive"
                        : log.level === "warn"
                        ? "text-accent"
                        : log.level === "debug"
                        ? "text-muted-foreground/60"
                        : "text-muted-foreground"
                    }`}
                  >
                    {log.level}
                  </span>
                  <span
                    className={
                      log.level === "error"
                        ? "text-destructive"
                        : log.level === "warn"
                        ? "text-accent"
                        : "text-foreground"
                    }
                  >
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Logs;
