import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { CreditCard, Loader2 } from "lucide-react";

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
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalCost = properties?.reduce((sum, p) => sum + (p.total_cost_cents || 0), 0) ?? 0;
  const completedCount = properties?.filter((p) => p.status === "complete").length ?? 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Billing</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-lg border border-border p-4 space-y-1">
          <p className="text-sm text-muted-foreground">Total Spent</p>
          <p className="text-2xl font-bold">{formatCents(totalCost)}</p>
        </div>
        <div className="rounded-lg border border-border p-4 space-y-1">
          <p className="text-sm text-muted-foreground">Videos Completed</p>
          <p className="text-2xl font-bold">{completedCount}</p>
        </div>
        <div className="rounded-lg border border-border p-4 space-y-1">
          <p className="text-sm text-muted-foreground">Avg Cost / Video</p>
          <p className="text-2xl font-bold">
            {completedCount > 0 ? formatCents(Math.round(totalCost / completedCount)) : "—"}
          </p>
        </div>
      </div>

      {/* Payment method placeholder */}
      <div className="rounded-lg border border-dashed border-border p-6 text-center space-y-2">
        <CreditCard className="h-8 w-8 text-muted-foreground mx-auto" />
        <p className="font-medium">Payment method</p>
        <p className="text-sm text-muted-foreground">
          Stripe integration coming soon. You'll be able to add a card and manage automatic billing.
        </p>
      </div>

      {/* Per-property breakdown */}
      {properties && properties.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Cost Breakdown</h2>
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr className="text-left text-sm text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Property</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium text-right">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {properties.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-sm">{p.address}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground capitalize">{p.status}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {new Date(p.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono">
                      {p.total_cost_cents > 0 ? formatCents(p.total_cost_cents) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/30">
                <tr>
                  <td colSpan={3} className="px-4 py-3 font-medium text-sm">Total</td>
                  <td className="px-4 py-3 text-sm text-right font-mono font-bold">
                    {formatCents(totalCost)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
