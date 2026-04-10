import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Download, RotateCcw, Eye, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { getStatusColor, formatCents, formatDuration, getRelativeTime } from "@/lib/types";
import type { Property } from "@/lib/types";
import { fetchProperties } from "@/lib/api";

const Properties = () => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [properties, setProperties] = useState<Property[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const perPage = 25;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const params: { page: number; limit: number; status?: string; search?: string } = {
          page,
          limit: perPage,
        };
        if (statusFilter !== "all") params.status = statusFilter;
        if (search) params.search = search;
        const res = await fetchProperties(params);
        if (cancelled) return;
        setProperties(res.properties);
        setTotal(res.total);
        setTotalPages(res.totalPages);
        setError(null);
      } catch (err: any) {
        if (cancelled) return;
        setError(err.message || "Failed to load properties");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [search, statusFilter, page]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by address..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="queued">Queued</SelectItem>
                <SelectItem value="analyzing">Analyzing</SelectItem>
                <SelectItem value="scripting">Scripting</SelectItem>
                <SelectItem value="generating">Generating</SelectItem>
                <SelectItem value="qc">QC</SelectItem>
                <SelectItem value="assembling">Assembling</SelectItem>
                <SelectItem value="complete">Complete</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="needs_review">Needs Review</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="pt-4 pb-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center py-12 text-destructive text-sm">{error}</div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Address</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Photos</TableHead>
                    <TableHead>Cost</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {properties.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                        No properties found
                      </TableCell>
                    </TableRow>
                  )}
                  {properties.map(prop => (
                    <TableRow key={prop.id}>
                      <TableCell>
                        <Link to={`/dashboard/properties/${prop.id}`} className="text-sm font-medium hover:underline">
                          {prop.address}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{prop.listing_agent}</TableCell>
                      <TableCell className="font-mono text-sm">${prop.price.toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(prop.status)} variant="secondary">{prop.status}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{prop.photo_count}</TableCell>
                      <TableCell className="font-mono text-xs">{formatCents(prop.total_cost_cents)}</TableCell>
                      <TableCell className="font-mono text-xs">{prop.processing_time_ms > 0 ? formatDuration(prop.processing_time_ms) : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{getRelativeTime(prop.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                            <Link to={`/dashboard/properties/${prop.id}`}><Eye className="h-3.5 w-3.5" /></Link>
                          </Button>
                          {prop.status === "complete" && (
                            <Button variant="ghost" size="icon" className="h-7 w-7"><Download className="h-3.5 w-3.5" /></Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7"><RotateCcw className="h-3.5 w-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {totalPages > 1 && (
                <div className="flex items-center justify-between py-3 px-2">
                  <span className="text-xs text-muted-foreground">{total} properties</span>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-xs font-mono px-2">{page}/{totalPages}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Properties;
