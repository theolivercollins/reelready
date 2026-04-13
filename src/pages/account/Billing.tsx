import { useQuery } from "@tanstack/react-query";
import { motion, type Variants } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 1.0, delay: i * 0.06, ease: EASE },
  }),
};

const stagger: Variants = {
  visible: { transition: { staggerChildren: 0.08 } },
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function AccountBilling() {
  const { user } = useAuth();

  const { data: properties, isLoading } = useQuery({
    queryKey: ["account-billing", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, address, status, total_cost_cents, created_at")
        .eq("submitted_by", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-32">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="label text-muted-foreground">Loading…</span>
      </div>
    );
  }

  const totalCost =
    properties?.reduce((sum, p) => sum + (p.total_cost_cents || 0), 0) ?? 0;
  const completedCount =
    properties?.filter((p) => p.status === "complete").length ?? 0;
  const avgCost =
    completedCount > 0
      ? formatCents(Math.round(totalCost / completedCount))
      : "—";

  const stats = [
    {
      label: "Total spent",
      value: formatCents(totalCost),
      helper: "Lifetime across all listings",
    },
    {
      label: "Videos completed",
      value: String(completedCount).padStart(2, "0"),
      helper: "Delivered, downloaded, live",
    },
    {
      label: "Avg / video",
      value: avgCost,
      helper: "Per completed listing",
    },
  ];

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={stagger}
      className="space-y-16"
    >
      {/* Title block */}
      <motion.div variants={fadeUp}>
        <span className="label text-muted-foreground">— Spend</span>
        <h1 className="display-md font-display mt-5 text-foreground">Billing.</h1>
      </motion.div>

      {/* Editorial stats grid */}
      <motion.div
        variants={fadeUp}
        className="grid gap-px border border-border bg-border md:grid-cols-3"
      >
        {stats.map((stat) => (
          <div key={stat.label} className="bg-background p-10">
            <span className="label text-muted-foreground">{stat.label}</span>
            <div className="mt-6 flex items-baseline gap-3">
              <span className="display-md font-mono font-semibold tracking-[-0.025em] text-foreground">
                {stat.value}
              </span>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">{stat.helper}</p>
          </div>
        ))}
      </motion.div>

      {/* Payment method placeholder — clean editorial card */}
      <motion.div
        variants={fadeUp}
        className="border border-border bg-background p-12"
      >
        <span className="label text-muted-foreground">— Payment method</span>
        <h2 className="font-display mt-5 text-2xl font-semibold tracking-[-0.02em] text-foreground md:text-3xl">
          Stripe billing soon.
        </h2>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Add a card to enable automatic billing for completed projects.
        </p>
      </motion.div>

      {/* Cost breakdown — editorial table */}
      {properties && properties.length > 0 && (
        <motion.div variants={fadeUp} className="space-y-8">
          <div>
            <span className="label text-muted-foreground">— Cost breakdown</span>
            <h2 className="font-display mt-5 text-2xl font-semibold tracking-[-0.02em] text-foreground md:text-3xl">
              Per project.
            </h2>
          </div>

          <div className="border-y border-border">
            {/* Header */}
            <div className="hidden border-b border-border md:grid md:grid-cols-[2.4fr_1fr_1fr_1fr] md:gap-6 md:px-6 md:py-5">
              <span className="label text-muted-foreground">Property</span>
              <span className="label text-muted-foreground">Status</span>
              <span className="label text-muted-foreground">Date</span>
              <span className="label text-right text-muted-foreground">Cost</span>
            </div>

            {properties.map((p) => (
              <div
                key={p.id}
                className="grid grid-cols-1 gap-2 border-b border-border px-6 py-5 transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-foreground/[0.02] md:grid-cols-[2.4fr_1fr_1fr_1fr] md:items-center md:gap-6"
              >
                <p className="font-display text-base font-semibold tracking-[-0.01em] text-foreground">
                  {p.address}
                </p>
                <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
                  {p.status}
                </p>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {new Date(p.created_at).toLocaleDateString()}
                </p>
                <p className="font-mono text-sm text-foreground md:text-right">
                  {p.total_cost_cents > 0 ? formatCents(p.total_cost_cents) : "—"}
                </p>
              </div>
            ))}

            {/* Total footer */}
            <div className="grid grid-cols-1 gap-2 px-6 py-6 md:grid-cols-[2.4fr_1fr_1fr_1fr] md:items-center md:gap-6">
              <span className="label text-muted-foreground">Total</span>
              <span className="hidden md:block" />
              <span className="hidden md:block" />
              <span className="font-mono text-lg font-semibold text-foreground md:text-right">
                {formatCents(totalCost)}
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
