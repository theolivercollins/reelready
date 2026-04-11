import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, Clock, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Clock }> = {
  queued: { label: "Queued", variant: "secondary", icon: Clock },
  analyzing: { label: "Analyzing", variant: "outline", icon: Loader2 },
  scripting: { label: "Scripting", variant: "outline", icon: Loader2 },
  generating: { label: "Generating", variant: "outline", icon: Loader2 },
  qc: { label: "Quality Check", variant: "outline", icon: Loader2 },
  assembling: { label: "Assembling", variant: "outline", icon: Loader2 },
  complete: { label: "Complete", variant: "default", icon: CheckCircle },
  failed: { label: "Failed", variant: "destructive", icon: AlertCircle },
  needs_review: { label: "Needs Review", variant: "destructive", icon: AlertCircle },
};

export default function AccountProperties() {
  const { user } = useAuth();

  const { data: properties, isLoading } = useQuery({
    queryKey: ["account-properties", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("*")
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

  if (!properties?.length) {
    return (
      <div className="text-center py-16 space-y-4">
        <h2 className="text-xl font-semibold">No properties yet</h2>
        <p className="text-muted-foreground">Submit your first property to get started.</p>
        <Link to="/upload">
          <Button>Upload Property</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Your Properties</h1>
        <Link to="/upload">
          <Button size="sm">New Property</Button>
        </Link>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr className="text-left text-sm text-muted-foreground">
              <th className="px-4 py-3 font-medium">Address</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Photos</th>
              <th className="px-4 py-3 font-medium">Submitted</th>
              <th className="px-4 py-3 font-medium text-right">Deliverables</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {properties.map((property) => {
              const status = statusConfig[property.status] || statusConfig.queued;
              const StatusIcon = status.icon;
              return (
                <tr key={property.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium">{property.address}</p>
                      <p className="text-sm text-muted-foreground">
                        {property.bedrooms}bd / {property.bathrooms}ba &middot; ${property.price?.toLocaleString()}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={status.variant} className="gap-1">
                      <StatusIcon className="h-3 w-3" />
                      {status.label}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {property.photo_count}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {new Date(property.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {property.status === "complete" ? (
                        <>
                          {property.horizontal_video_url && (
                            <a href={property.horizontal_video_url} target="_blank" rel="noopener noreferrer">
                              <Button variant="outline" size="sm" className="gap-1">
                                <Download className="h-3 w-3" />
                                Landscape
                              </Button>
                            </a>
                          )}
                          {property.vertical_video_url && (
                            <a href={property.vertical_video_url} target="_blank" rel="noopener noreferrer">
                              <Button variant="outline" size="sm" className="gap-1">
                                <Download className="h-3 w-3" />
                                Portrait
                              </Button>
                            </a>
                          )}
                        </>
                      ) : (
                        <Link to={`/status/${property.id}`}>
                          <Button variant="ghost" size="sm" className="gap-1">
                            <ExternalLink className="h-3 w-3" />
                            Track
                          </Button>
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
