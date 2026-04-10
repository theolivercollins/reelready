import { useState, useMemo, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Pause, Play, Download } from "lucide-react";
import { allLogs, allProperties, PipelineStage, LogLevel } from "@/lib/mock-data";

const Logs = () => {
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    let result = [...allLogs];
    if (stageFilter !== "all") result = result.filter(l => l.stage === stageFilter);
    if (levelFilter !== "all") result = result.filter(l => l.level === levelFilter);
    if (search) result = result.filter(l => l.message.toLowerCase().includes(search.toLowerCase()));
    return result.slice(0, 500);
  }, [stageFilter, levelFilter, search]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered, autoScroll]);

  const getPropertyAddress = (pid: string) => {
    const p = allProperties.find(p => p.id === pid);
    return p ? p.address.split(",")[0] : "Unknown";
  };

  const exportCSV = () => {
    const header = "Timestamp,Property,Stage,Level,Message\n";
    const rows = filtered.map(l =>
      `"${l.created_at}","${getPropertyAddress(l.property_id)}","${l.stage}","${l.level}","${l.message}"`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pipeline-logs.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search logs..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="w-[130px]"><SelectValue placeholder="Stage" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                {(["intake", "analysis", "scripting", "generation", "qc", "assembly", "delivery"] as PipelineStage[]).map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={levelFilter} onValueChange={setLevelFilter}>
              <SelectTrigger className="w-[110px]"><SelectValue placeholder="Level" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                {(["info", "warn", "error", "debug"] as LogLevel[]).map(l => (
                  <SelectItem key={l} value={l}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="gap-1" onClick={() => setAutoScroll(!autoScroll)}>
              {autoScroll ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              {autoScroll ? "Pause" : "Resume"}
            </Button>
            <Button variant="outline" size="sm" className="gap-1" onClick={exportCSV}>
              <Download className="h-3 w-3" /> Export
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Log viewer */}
      <Card>
        <CardContent className="p-0">
          <div ref={scrollRef} className="h-[600px] overflow-y-auto p-4 font-mono text-xs space-y-0.5 bg-card">
            {filtered.length === 0 && (
              <p className="text-muted-foreground text-center py-12">No logs match your filters</p>
            )}
            {filtered.map(log => (
              <div key={log.id} className="flex items-start gap-2 py-0.5 hover:bg-accent/30 px-1 rounded">
                <span className="text-muted-foreground shrink-0 w-[70px]">
                  {new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
                <span className="text-muted-foreground shrink-0 w-[120px] truncate">
                  {getPropertyAddress(log.property_id)}
                </span>
                <Badge variant="secondary" className="text-[9px] h-4 px-1 shrink-0">{log.stage}</Badge>
                <Badge
                  variant="secondary"
                  className={`text-[9px] h-4 px-1 shrink-0 ${
                    log.level === "error" ? "bg-destructive text-destructive-foreground" :
                    log.level === "warn" ? "bg-warning text-warning-foreground" : ""
                  }`}
                >
                  {log.level}
                </Badge>
                <span className={
                  log.level === "error" ? "text-destructive" :
                  log.level === "warn" ? "text-warning" : "text-foreground"
                }>
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Logs;
