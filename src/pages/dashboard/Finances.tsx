import { useEffect, useMemo, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { motion } from "framer-motion";
import { Loader2, Plus, Trash2, TrendingUp, TrendingDown, Wallet, Coins, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCents } from "@/lib/types";
import type {
  TokenPurchase,
  Expense,
  RevenueEntry,
  TokenProvider,
  CostEvent,
} from "@/lib/types";
import {
  listTokenPurchases,
  createTokenPurchase,
  deleteTokenPurchase,
  listExpenses,
  createExpense,
  deleteExpense,
  listRevenueEntries,
  createRevenueEntry,
  deleteRevenueEntry,
  listCostEvents,
} from "@/lib/finances";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const PROVIDERS: { id: TokenProvider; label: string }[] = [
  { id: "runway", label: "Runway" },
  { id: "kling", label: "Kling" },
  { id: "luma", label: "Luma" },
  { id: "anthropic", label: "Claude" },
  { id: "openai", label: "OpenAI" },
  { id: "other", label: "Other" },
];

const PROVIDER_COLORS: Record<TokenProvider, string> = {
  runway: "#6366f1",
  kling: "#22d3ee",
  luma: "#f97316",
  anthropic: "#d97706",
  openai: "#10b981",
  other: "#64748b",
};

interface ProviderSummary {
  provider: TokenProvider;
  label: string;
  purchasedCents: number;
  purchasedUnits: number;
  spentCents: number;
  spentUnits: number;
}

function parseMoneyToCents(value: string): number {
  const n = parseFloat(value.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export default function Finances() {
  const [loading, setLoading] = useState(true);
  const [purchases, setPurchases] = useState<TokenPurchase[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [revenues, setRevenues] = useState<RevenueEntry[]>([]);
  const [costEvents, setCostEvents] = useState<CostEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Token purchase form
  const [tpProvider, setTpProvider] = useState<TokenProvider>("runway");
  const [tpAmount, setTpAmount] = useState("");
  const [tpUnits, setTpUnits] = useState("");
  const [tpUnitType, setTpUnitType] = useState("credits");
  const [tpNote, setTpNote] = useState("");
  const [tpSubmitting, setTpSubmitting] = useState(false);

  // Expense form
  const [expCategory, setExpCategory] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [expDesc, setExpDesc] = useState("");
  const [expSubmitting, setExpSubmitting] = useState(false);

  // Revenue form
  const [revSource, setRevSource] = useState("");
  const [revAmount, setRevAmount] = useState("");
  const [revNote, setRevNote] = useState("");
  const [revSubmitting, setRevSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, e, r, c] = await Promise.all([
          listTokenPurchases(),
          listExpenses(),
          listRevenueEntries(),
          listCostEvents(500),
        ]);
        if (cancelled) return;
        setPurchases(p);
        setExpenses(e);
        setRevenues(r);
        setCostEvents(c);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load finances");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Derived totals ───
  const totalRevenueCents = useMemo(
    () => revenues.reduce((s, r) => s + (r.amount_cents || 0), 0),
    [revenues],
  );
  const totalPurchasesCents = useMemo(
    () => purchases.reduce((s, p) => s + (p.amount_cents || 0), 0),
    [purchases],
  );
  const totalExpensesCents = useMemo(
    () => expenses.reduce((s, e) => s + (e.amount_cents || 0), 0),
    [expenses],
  );
  const totalSpendCents = totalPurchasesCents + totalExpensesCents;
  const netCents = totalRevenueCents - totalSpendCents;

  // Per-provider rollup — purchased vs spent (from cost_events)
  const providerSummary: ProviderSummary[] = useMemo(() => {
    const map = new Map<TokenProvider, ProviderSummary>();
    for (const prov of PROVIDERS) {
      map.set(prov.id, {
        provider: prov.id,
        label: prov.label,
        purchasedCents: 0,
        purchasedUnits: 0,
        spentCents: 0,
        spentUnits: 0,
      });
    }
    for (const p of purchases) {
      const row = map.get(p.provider);
      if (!row) continue;
      row.purchasedCents += p.amount_cents;
      row.purchasedUnits += p.units || 0;
    }
    for (const c of costEvents) {
      const row = map.get(c.provider as TokenProvider);
      if (!row) continue;
      row.spentCents += c.cost_cents;
      row.spentUnits += c.units_consumed || 0;
    }
    return Array.from(map.values()).filter(
      (r) => r.purchasedCents > 0 || r.spentCents > 0,
    );
  }, [purchases, costEvents]);

  const pieData = providerSummary
    .filter((p) => p.spentCents > 0)
    .map((p) => ({
      name: p.label,
      value: p.spentCents,
      provider: p.provider,
    }));

  // 30-day net series (revenue − spend)
  const netSeries = useMemo(() => {
    const buckets = new Map<string, { revenue: number; spend: number }>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      buckets.set(key, { revenue: 0, spend: 0 });
    }
    for (const r of revenues) {
      const key = r.received_at.slice(0, 10);
      const b = buckets.get(key);
      if (b) b.revenue += r.amount_cents;
    }
    for (const p of purchases) {
      const key = p.purchased_at.slice(0, 10);
      const b = buckets.get(key);
      if (b) b.spend += p.amount_cents;
    }
    for (const e of expenses) {
      const key = e.incurred_at.slice(0, 10);
      const b = buckets.get(key);
      if (b) b.spend += e.amount_cents;
    }
    return Array.from(buckets.entries()).map(([date, v]) => ({
      date,
      revenue: v.revenue,
      spend: v.spend,
      net: v.revenue - v.spend,
    }));
  }, [revenues, purchases, expenses]);

  // ─── Handlers ───
  async function handleAddPurchase(e: React.FormEvent) {
    e.preventDefault();
    if (!tpAmount) return;
    setTpSubmitting(true);
    try {
      const p = await createTokenPurchase({
        provider: tpProvider,
        amount_cents: parseMoneyToCents(tpAmount),
        units: Number(tpUnits) || 0,
        unit_type: tpUnitType || undefined,
        note: tpNote || undefined,
      });
      setPurchases((prev) => [p, ...prev]);
      setTpAmount("");
      setTpUnits("");
      setTpNote("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setTpSubmitting(false);
    }
  }

  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!expCategory || !expAmount) return;
    setExpSubmitting(true);
    try {
      const x = await createExpense({
        category: expCategory.trim(),
        amount_cents: parseMoneyToCents(expAmount),
        description: expDesc || undefined,
      });
      setExpenses((prev) => [x, ...prev]);
      setExpCategory("");
      setExpAmount("");
      setExpDesc("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setExpSubmitting(false);
    }
  }

  async function handleAddRevenue(e: React.FormEvent) {
    e.preventDefault();
    if (!revSource || !revAmount) return;
    setRevSubmitting(true);
    try {
      const r = await createRevenueEntry({
        source: revSource.trim(),
        amount_cents: parseMoneyToCents(revAmount),
        note: revNote || undefined,
      });
      setRevenues((prev) => [r, ...prev]);
      setRevSource("");
      setRevAmount("");
      setRevNote("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setRevSubmitting(false);
    }
  }

  async function handleDeletePurchase(id: string) {
    if (!confirm("Delete this purchase record?")) return;
    await deleteTokenPurchase(id);
    setPurchases((prev) => prev.filter((p) => p.id !== id));
  }

  async function handleDeleteExpense(id: string) {
    if (!confirm("Delete this expense?")) return;
    await deleteExpense(id);
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  }

  async function handleDeleteRevenue(id: string) {
    if (!confirm("Delete this revenue entry?")) return;
    await deleteRevenueEntry(id);
    setRevenues((prev) => prev.filter((r) => r.id !== id));
  }

  if (loading) {
    return (
      <div className="flex justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-destructive/40 bg-destructive/5 p-10">
        <span className="label text-destructive">— Error</span>
        <p className="mt-3 text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  const NetIcon = netCents >= 0 ? TrendingUp : TrendingDown;
  const netTone = netCents >= 0 ? "text-accent" : "text-destructive";

  return (
    <div className="space-y-16">
      {/* Heading */}
      <div>
        <span className="label text-muted-foreground">— Finances</span>
        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.02em] md:text-3xl">
          Money in, money out
        </h2>
      </div>

      {/* ─── KPI row ─── */}
      <section className="grid gap-px border border-border bg-border md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Revenue in", value: formatCents(totalRevenueCents), icon: Wallet, tone: "text-accent" },
          { label: "Token spend", value: formatCents(totalPurchasesCents), icon: Coins, tone: "text-foreground" },
          { label: "Other expenses", value: formatCents(totalExpensesCents), icon: Receipt, tone: "text-foreground" },
          {
            label: "Net",
            value: formatCents(Math.abs(netCents)),
            icon: NetIcon,
            tone: netTone,
            prefix: netCents >= 0 ? "+" : "−",
          },
        ].map((k, i) => (
          <motion.div
            key={k.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: i * 0.05, ease: EASE }}
            className="bg-background p-8"
          >
            <div className="flex items-start justify-between">
              <span className="label text-muted-foreground">{k.label}</span>
              <k.icon className={`h-4 w-4 ${k.tone}`} strokeWidth={1.5} />
            </div>
            <div className={`tabular mt-6 text-4xl font-semibold tracking-[-0.03em] ${k.tone}`}>
              {"prefix" in k && k.prefix ? k.prefix : ""}
              {k.value}
            </div>
          </motion.div>
        ))}
      </section>

      {/* ─── 30-day net chart + spend pie ─── */}
      <section className="grid gap-px border border-border bg-border lg:grid-cols-[2fr_1fr]">
        <div className="bg-background p-8">
          <div className="flex items-end justify-between">
            <div>
              <span className="label text-muted-foreground">— Cashflow</span>
              <h3 className="mt-3 text-lg font-semibold tracking-[-0.01em]">30-day net</h3>
            </div>
            <span className={`tabular text-xs ${netTone}`}>
              {netCents >= 0 ? "+" : "−"}
              {formatCents(Math.abs(netCents))} total
            </span>
          </div>
          <div className="mt-8 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={netSeries} margin={{ top: 10, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="revArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="spendArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="0" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => v.slice(5)}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `$${(v / 100).toFixed(0)}`}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 0,
                    fontSize: 11,
                    padding: 10,
                  }}
                  formatter={(v: number, name: string) => [formatCents(v), name]}
                />
                <Area type="monotone" dataKey="revenue" stroke="hsl(var(--accent))" strokeWidth={1.5} fill="url(#revArea)" />
                <Area
                  type="monotone"
                  dataKey="spend"
                  stroke="hsl(var(--destructive))"
                  strokeWidth={1.5}
                  fill="url(#spendArea)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-5 flex gap-6">
            <span className="label inline-flex items-center gap-2 text-muted-foreground">
              <span className="h-[2px] w-5 bg-accent" /> Revenue
            </span>
            <span className="label inline-flex items-center gap-2 text-muted-foreground">
              <span className="h-[2px] w-5 bg-destructive" /> Spend
            </span>
          </div>
        </div>

        <div className="bg-background p-8">
          <span className="label text-muted-foreground">— Real usage</span>
          <h3 className="mt-3 text-lg font-semibold tracking-[-0.01em]">Token spend by provider</h3>
          {pieData.length === 0 ? (
            <p className="mt-16 text-center text-sm text-muted-foreground">No spend recorded yet</p>
          ) : (
            <>
              <div className="mt-6 h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={50}
                      outerRadius={80}
                      stroke="hsl(var(--background))"
                      strokeWidth={2}
                      paddingAngle={2}
                    >
                      {pieData.map((d) => (
                        <Cell key={d.provider} fill={PROVIDER_COLORS[d.provider as TokenProvider]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 0,
                        fontSize: 11,
                        padding: 10,
                      }}
                      formatter={(v: number) => formatCents(v)}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-6 space-y-2">
                {pieData.map((d) => {
                  const pct = totalSpentFromCostEvents(pieData) > 0
                    ? (d.value / totalSpentFromCostEvents(pieData)) * 100
                    : 0;
                  return (
                    <li key={d.provider} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2 w-2"
                          style={{ backgroundColor: PROVIDER_COLORS[d.provider as TokenProvider] }}
                        />
                        <span className="text-foreground">{d.name}</span>
                      </span>
                      <span className="tabular text-muted-foreground">
                        {formatCents(d.value)} · {pct.toFixed(0)}%
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </section>

      {/* ─── Provider balances — purchased vs spent ─── */}
      <section>
        <span className="label text-muted-foreground">— Balances</span>
        <h3 className="mt-3 text-xl font-semibold tracking-[-0.01em]">Token balance by provider</h3>

        {providerSummary.length === 0 ? (
          <p className="mt-10 border border-dashed border-border bg-secondary/30 p-10 text-center text-sm text-muted-foreground">
            Log a token purchase below to start tracking balances.
          </p>
        ) : (
          <div className="mt-10 grid gap-px border border-border bg-border md:grid-cols-2 xl:grid-cols-3">
            {providerSummary.map((row) => {
              const balanceCents = row.purchasedCents - row.spentCents;
              const usedPct =
                row.purchasedCents > 0
                  ? Math.min(100, (row.spentCents / row.purchasedCents) * 100)
                  : 0;
              const tone = balanceCents < 0 ? "text-destructive" : "text-foreground";
              return (
                <div key={row.provider} className="bg-background p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="label text-muted-foreground">{row.label}</span>
                      <div className={`tabular mt-4 text-3xl font-semibold tracking-[-0.02em] ${tone}`}>
                        {balanceCents < 0 ? "−" : ""}
                        {formatCents(Math.abs(balanceCents))}
                      </div>
                      <p className="mt-2 text-[11px] text-muted-foreground">remaining</p>
                    </div>
                    <span
                      className="h-3 w-3"
                      style={{ backgroundColor: PROVIDER_COLORS[row.provider] }}
                    />
                  </div>
                  <div className="mt-6 h-[3px] w-full bg-border">
                    <motion.div
                      className="h-full"
                      style={{ backgroundColor: PROVIDER_COLORS[row.provider] }}
                      initial={{ width: 0 }}
                      animate={{ width: `${usedPct}%` }}
                      transition={{ duration: 1, ease: EASE }}
                    />
                  </div>
                  <div className="tabular mt-4 flex justify-between text-[11px] text-muted-foreground">
                    <span>{formatCents(row.spentCents)} spent</span>
                    <span>{formatCents(row.purchasedCents)} purchased</span>
                  </div>
                  {row.purchasedUnits > 0 && (
                    <div className="tabular mt-2 flex justify-between text-[10px] text-muted-foreground/60">
                      <span>{row.spentUnits.toFixed(0)} units used</span>
                      <span>{row.purchasedUnits.toFixed(0)} units bought</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ─── Forms row ─── */}
      <section className="grid gap-px border border-border bg-border lg:grid-cols-3">
        {/* Log token purchase */}
        <form onSubmit={handleAddPurchase} className="bg-background p-8">
          <span className="label text-muted-foreground">— Log</span>
          <h3 className="mt-3 text-lg font-semibold tracking-[-0.01em]">New token purchase</h3>
          <div className="mt-6 space-y-4">
            <div>
              <Label className="label text-muted-foreground">Provider</Label>
              <Select value={tpProvider} onValueChange={(v) => setTpProvider(v as TokenProvider)}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="label text-muted-foreground">Amount paid</Label>
                <div className="relative mt-2">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground/60">
                    $
                  </span>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={tpAmount}
                    onChange={(e) => setTpAmount(e.target.value)}
                    placeholder="250.00"
                    className="tabular pl-7"
                    required
                  />
                </div>
              </div>
              <div>
                <Label className="label text-muted-foreground">Units</Label>
                <Input
                  type="number"
                  value={tpUnits}
                  onChange={(e) => setTpUnits(e.target.value)}
                  placeholder="25000"
                  className="tabular mt-2"
                />
              </div>
            </div>
            <div>
              <Label className="label text-muted-foreground">Unit type</Label>
              <Input
                value={tpUnitType}
                onChange={(e) => setTpUnitType(e.target.value)}
                placeholder="credits / tokens / kling_units"
                className="mt-2"
              />
            </div>
            <div>
              <Label className="label text-muted-foreground">Note</Label>
              <Input
                value={tpNote}
                onChange={(e) => setTpNote(e.target.value)}
                placeholder="Receipt #, reference…"
                className="mt-2"
              />
            </div>
            <Button type="submit" size="sm" disabled={tpSubmitting || !tpAmount} className="w-full">
              {tpSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Log purchase
            </Button>
          </div>
        </form>

        {/* Log expense */}
        <form onSubmit={handleAddExpense} className="bg-background p-8">
          <span className="label text-muted-foreground">— Log</span>
          <h3 className="mt-3 text-lg font-semibold tracking-[-0.01em]">New expense</h3>
          <div className="mt-6 space-y-4">
            <div>
              <Label className="label text-muted-foreground">Category</Label>
              <Input
                value={expCategory}
                onChange={(e) => setExpCategory(e.target.value)}
                placeholder="Hosting, tools, marketing…"
                className="mt-2"
                required
              />
            </div>
            <div>
              <Label className="label text-muted-foreground">Amount</Label>
              <div className="relative mt-2">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground/60">
                  $
                </span>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={expAmount}
                  onChange={(e) => setExpAmount(e.target.value)}
                  placeholder="0.00"
                  className="tabular pl-7"
                  required
                />
              </div>
            </div>
            <div>
              <Label className="label text-muted-foreground">Description</Label>
              <Input
                value={expDesc}
                onChange={(e) => setExpDesc(e.target.value)}
                placeholder="What was it for?"
                className="mt-2"
              />
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={expSubmitting || !expCategory || !expAmount}
              className="w-full"
            >
              {expSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Log expense
            </Button>
          </div>
        </form>

        {/* Log revenue */}
        <form onSubmit={handleAddRevenue} className="bg-background p-8">
          <span className="label text-muted-foreground">— Log</span>
          <h3 className="mt-3 text-lg font-semibold tracking-[-0.01em]">New revenue</h3>
          <div className="mt-6 space-y-4">
            <div>
              <Label className="label text-muted-foreground">Source</Label>
              <Input
                value={revSource}
                onChange={(e) => setRevSource(e.target.value)}
                placeholder="Customer name, invoice, etc"
                className="mt-2"
                required
              />
            </div>
            <div>
              <Label className="label text-muted-foreground">Amount</Label>
              <div className="relative mt-2">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground/60">
                  $
                </span>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={revAmount}
                  onChange={(e) => setRevAmount(e.target.value)}
                  placeholder="0.00"
                  className="tabular pl-7"
                  required
                />
              </div>
            </div>
            <div>
              <Label className="label text-muted-foreground">Note</Label>
              <Input
                value={revNote}
                onChange={(e) => setRevNote(e.target.value)}
                placeholder="Stripe, manual, subscription…"
                className="mt-2"
              />
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={revSubmitting || !revSource || !revAmount}
              className="w-full"
            >
              {revSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Log revenue
            </Button>
          </div>
        </form>
      </section>

      {/* ─── Ledger tables ─── */}
      <LedgerTable
        title="Token purchases"
        rows={purchases.map((p) => ({
          id: p.id,
          cols: [
            { value: (PROVIDERS.find((x) => x.id === p.provider)?.label || p.provider), className: "label text-foreground" },
            { value: p.units ? `${p.units} ${p.unit_type || ""}` : "—", className: "tabular text-xs text-muted-foreground" },
            { value: p.note || "—", className: "truncate text-xs text-muted-foreground" },
            { value: new Date(p.purchased_at).toLocaleDateString(), className: "tabular text-xs text-muted-foreground" },
            { value: formatCents(p.amount_cents), className: "tabular text-right text-sm font-semibold" },
          ],
        }))}
        columns={["Provider", "Units", "Note", "Date", "Amount"]}
        onDelete={handleDeletePurchase}
      />

      <LedgerTable
        title="Other expenses"
        rows={expenses.map((e) => ({
          id: e.id,
          cols: [
            { value: e.category, className: "label text-foreground" },
            { value: e.description || "—", className: "truncate text-xs text-muted-foreground" },
            { value: "", className: "" },
            { value: new Date(e.incurred_at).toLocaleDateString(), className: "tabular text-xs text-muted-foreground" },
            { value: formatCents(e.amount_cents), className: "tabular text-right text-sm font-semibold" },
          ],
        }))}
        columns={["Category", "Description", "", "Date", "Amount"]}
        onDelete={handleDeleteExpense}
      />

      <LedgerTable
        title="Revenue"
        rows={revenues.map((r) => ({
          id: r.id,
          cols: [
            { value: r.source, className: "label text-foreground" },
            { value: r.note || "—", className: "truncate text-xs text-muted-foreground" },
            { value: "", className: "" },
            { value: new Date(r.received_at).toLocaleDateString(), className: "tabular text-xs text-muted-foreground" },
            { value: formatCents(r.amount_cents), className: "tabular text-right text-sm font-semibold text-accent" },
          ],
        }))}
        columns={["Source", "Note", "", "Date", "Amount"]}
        onDelete={handleDeleteRevenue}
      />
    </div>
  );
}

function totalSpentFromCostEvents(pieData: { value: number }[]) {
  return pieData.reduce((s, d) => s + d.value, 0);
}

interface LedgerRow {
  id: string;
  cols: { value: string; className: string }[];
}

function LedgerTable({
  title,
  rows,
  columns,
  onDelete,
}: {
  title: string;
  rows: LedgerRow[];
  columns: string[];
  onDelete: (id: string) => void;
}) {
  return (
    <section>
      <div className="flex items-end justify-between">
        <div>
          <span className="label text-muted-foreground">— Ledger</span>
          <h3 className="mt-3 text-xl font-semibold tracking-[-0.01em]">{title}</h3>
        </div>
        <span className="tabular text-xs text-muted-foreground">{rows.length} entries</span>
      </div>
      <div className="mt-8 border-t border-border">
        <div className="grid grid-cols-[1.2fr_2fr_1fr_1fr_1fr_32px] gap-6 border-b border-border py-4">
          {columns.map((c, i) => (
            <span
              key={`${c}-${i}`}
              className={`label text-muted-foreground ${i === columns.length - 1 ? "text-right" : ""}`}
            >
              {c}
            </span>
          ))}
          <span />
        </div>
        {rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No entries yet</div>
        ) : (
          rows.map((row) => (
            <div
              key={row.id}
              className="group grid grid-cols-[1.2fr_2fr_1fr_1fr_1fr_32px] items-center gap-6 border-b border-border py-4 transition-colors duration-500 hover:bg-secondary/40"
            >
              {row.cols.map((c, i) => (
                <span key={i} className={c.className}>
                  {c.value}
                </span>
              ))}
              <button
                type="button"
                onClick={() => onDelete(row.id)}
                aria-label="Delete"
                className="flex h-7 w-7 items-center justify-center text-muted-foreground/40 opacity-0 transition-all duration-300 hover:text-destructive group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
