import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ChevronLeft, ChevronRight, Loader2, ArrowRight } from "lucide-react";
import { formatCents, getRelativeTime } from "@/lib/types";
import type { Property } from "@/lib/types";
import { fetchProperties } from "@/lib/api";
import { motion } from "framer-motion";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const statusLabel: Record<string, string> = {
  queued: "Queued",
  ingesting: "Ingesting",
  analyzing: "Analyzing",
  scripting: "Directing",
  generating: "Generating",
  qc: "QC",
  assembling: "Assembling",
  complete: "Delivered",
  failed: "Failed",
  needs_review: "Needs review",
};

const statusTone: Record<string, string> = {
  complete: "text-accent",
  failed: "text-destructive",
  needs_review: "text-destructive",
};

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
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load properties");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [search, statusFilter, page]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  return (
    <div className="space-y-12">
      <div className="flex items-end justify-between gap-6">
        <div>
          <span className="label text-muted-foreground">— All listings</span>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.02em]">
            <span className="tabular">{total}</span> total
          </h2>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[280px] flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            placeholder="Search by address…"
            className="pl-11"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            {Object.entries(statusLabel).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border-t border-border">
        <div className="grid grid-cols-[3fr_1.2fr_1fr_1.2fr_0.6fr_1fr_1fr_0.5fr] gap-6 border-b border-border py-4">
          <span className="label text-muted-foreground">Property</span>
          <span className="label text-muted-foreground">Agent</span>
          <span className="label text-right text-muted-foreground">Price</span>
          <span className="label text-muted-foreground">Status</span>
          <span className="label text-right text-muted-foreground">Photos</span>
          <span className="label text-right text-muted-foreground">Cost</span>
          <span className="label text-muted-foreground">Created</span>
          <span className="label text-right text-muted-foreground">View</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="py-24 text-center text-sm text-destructive">{error}</div>
        ) : properties.length === 0 ? (
          <div className="py-24 text-center text-sm text-muted-foreground">No listings match your filters</div>
        ) : (
          properties.map((p, i) => {
            const tone = statusTone[p.status] || "text-foreground";
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.02, ease: EASE }}
                className="group grid grid-cols-[3fr_1.2fr_1fr_1.2fr_0.6fr_1fr_1fr_0.5fr] items-center gap-6 border-b border-border py-5 transition-colors duration-500 hover:bg-secondary/40"
              >
                <Link to={`/dashboard/properties/${p.id}`} className="truncate text-sm font-medium hover:underline">
                  {p.address}
                </Link>
                <span className="truncate text-xs text-muted-foreground">{p.listing_agent}</span>
                <span className="tabular text-right text-sm">${p.price.toLocaleString()}</span>
                <span className={`label ${tone}`}>{statusLabel[p.status] || p.status}</span>
                <span className="tabular text-right text-xs text-muted-foreground">{p.photo_count}</span>
                <span className="tabular text-right text-xs">{formatCents(p.total_cost_cents)}</span>
                <span className="tabular text-xs text-muted-foreground">{getRelativeTime(p.created_at)}</span>
                <Link
                  to={`/dashboard/properties/${p.id}`}
                  className="flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="View"
                >
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && !loading && (
        <div className="flex items-center justify-between">
          <span className="label text-muted-foreground">
            <span className="tabular">{total}</span> properties
          </span>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>
            <span className="tabular px-3 text-xs text-muted-foreground">
              Page {page} / {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

    </div>
  );
};

export default Properties;
