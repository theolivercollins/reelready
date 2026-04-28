import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Loader2, ArrowLeft, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { createClient, getClient, updateClient } from "@/lib/clientsApi";

export default function ClientNew() {
  const navigate = useNavigate();
  const params = useParams<{ id?: string }>();
  const editingId = params.id;
  const isEditing = !!editingId;

  // Form state
  const [name, setName] = useState("");
  const [sierraPublicUrl, setSierraPublicUrl] = useState("");
  const [sierraAdminUrl, setSierraAdminUrl] = useState("");
  const [sierraSiteName, setSierraSiteName] = useState("");
  const [sierraUsername, setSierraUsername] = useState("");
  const [sierraPassword, setSierraPassword] = useState("");
  const [sierraRegionId, setSierraRegionId] = useState("");
  const [agentName, setAgentName] = useState("");
  const [agentTeamLine, setAgentTeamLine] = useState("");
  const [agentPhone, setAgentPhone] = useState("");
  const [agentEmail, setAgentEmail] = useState("");
  const [agentPhotoUrl, setAgentPhotoUrl] = useState("");
  const [agentScheduleUrl, setAgentScheduleUrl] = useState("");
  const [brandColor, setBrandColor] = useState("#171717");

  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(isEditing);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editingId) return;
    let cancelled = false;
    getClient(editingId)
      .then((c) => {
        if (cancelled) return;
        setName(c.name || "");
        setSierraPublicUrl(c.sierra_public_base_url || "");
        setSierraAdminUrl(c.sierra_admin_url || "");
        setSierraSiteName(c.sierra_site_name || "");
        setSierraUsername(c.sierra_admin_username || "");
        // Don't prefill password — operator types a new one only if changing.
        setSierraRegionId(c.sierra_region_id || "");
        setAgentName(c.agent_name || "");
        setAgentTeamLine(c.agent_team_line || "");
        setAgentPhone(c.agent_phone || "");
        setAgentEmail(c.agent_email || "");
        setAgentPhotoUrl(c.agent_photo_url || "");
        setAgentScheduleUrl(c.agent_schedule_url || "");
        setBrandColor(c.brand_primary_color || "#171717");
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editingId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Required field check — password only required on create, optional on edit.
    const baseValid =
      name && sierraPublicUrl && sierraAdminUrl && sierraSiteName && sierraUsername &&
      sierraRegionId && agentName && agentPhone && agentEmail && agentScheduleUrl;
    if (!baseValid || (!isEditing && !sierraPassword)) {
      setError("Please fill in all required fields.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name,
        sierra_public_base_url: sierraPublicUrl,
        sierra_admin_url: sierraAdminUrl,
        sierra_site_name: sierraSiteName,
        sierra_admin_username: sierraUsername,
        sierra_admin_password: sierraPassword || undefined,
        sierra_region_id: sierraRegionId,
        agent_name: agentName,
        agent_team_line: agentTeamLine || undefined,
        agent_phone: agentPhone,
        agent_email: agentEmail,
        agent_photo_url: agentPhotoUrl || undefined,
        agent_schedule_url: agentScheduleUrl,
        brand_primary_color: brandColor,
      };
      if (isEditing && editingId) {
        await updateClient(editingId, payload);
        toast.success("Client updated.");
      } else {
        await createClient(payload as Parameters<typeof createClient>[0]);
        toast.success("Client created successfully.");
      }
      navigate("/dashboard/clients");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-10">
      <div>
        <Link
          to="/dashboard/clients"
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> back to clients
        </Link>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.02em]">
          {isEditing ? "Edit client" : "Add new client"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
          {isEditing
            ? "Update this client's Sierra access and agent card. Leave the password blank to keep the existing one."
            : "Set up a Sierra Interactive site to publish custom listing landing pages."}
        </p>
        {loading && (
          <p className="mt-2 text-xs text-muted-foreground inline-flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading client…
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-8">

        {/* Site details */}
        <section className="space-y-5">
          <h3 className="text-xs uppercase tracking-wider font-medium text-muted-foreground border-b border-border pb-2">
            Site details
          </h3>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              Display name <span className="text-destructive">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Helgemo Team"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              Sierra public site URL <span className="text-destructive">*</span>
            </label>
            <Input
              value={sierraPublicUrl}
              onChange={(e) => setSierraPublicUrl(e.target.value)}
              placeholder="https://www.thehelgemoteam.com"
              type="url"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              Sierra region ID <span className="text-destructive">*</span>
            </label>
            <div className="flex items-start gap-3">
              <Input
                value={sierraRegionId}
                onChange={(e) => setSierraRegionId(e.target.value)}
                placeholder="240"
                className="max-w-[120px]"
                required
              />
              <p className="text-[11px] text-muted-foreground pt-2">
                The numeric ID Sierra uses in property URLs after{" "}
                <code className="bg-muted px-1 py-0.5 text-[10px]">/property-search/detail/</code>
              </p>
            </div>
          </div>
        </section>

        {/* Sierra admin access */}
        <section className="space-y-5">
          <h3 className="text-xs uppercase tracking-wider font-medium text-muted-foreground border-b border-border pb-2">
            Sierra admin access
          </h3>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              Sierra admin URL <span className="text-destructive">*</span>
            </label>
            <Input
              value={sierraAdminUrl}
              onChange={(e) => setSierraAdminUrl(e.target.value)}
              placeholder="https://client2.sierrainteractivedev.com"
              type="url"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              Sierra site name <span className="text-destructive">*</span>
            </label>
            <Input
              value={sierraSiteName}
              onChange={(e) => setSierraSiteName(e.target.value)}
              placeholder="thehelgemoteam"
              required
            />
            <p className="text-[11px] text-muted-foreground">
              The "Site Name" you type into the first field of the Sierra admin login page (above Username).
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              Sierra admin username <span className="text-destructive">*</span>
            </label>
            <Input
              value={sierraUsername}
              onChange={(e) => setSierraUsername(e.target.value)}
              placeholder="admin@example.com"
              autoComplete="username"
              required
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
              <p className="text-[11px] text-amber-700 dark:text-amber-500">
                Sierra admin credentials are encrypted at rest. They're used by an automated bot to publish listing pages on your behalf.
              </p>
            </div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              Sierra admin password {!isEditing && <span className="text-destructive">*</span>}
              {isEditing && <span className="opacity-50">(leave blank to keep existing)</span>}
            </label>
            <Input
              value={sierraPassword}
              onChange={(e) => setSierraPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              placeholder={isEditing ? "•••••••• (unchanged)" : ""}
              required={!isEditing}
            />
          </div>
        </section>

        {/* Agent / brand */}
        <section className="space-y-5">
          <h3 className="text-xs uppercase tracking-wider font-medium text-muted-foreground border-b border-border pb-2">
            Agent &amp; brand
          </h3>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              Agent name <span className="text-destructive">*</span>
            </label>
            <Input
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="Brian & Bonnie Helgemo"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              Agent team line <span className="opacity-50">(optional)</span>
            </label>
            <Input
              value={agentTeamLine}
              onChange={(e) => setAgentTeamLine(e.target.value)}
              placeholder="The Helgemo Team | Compass"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">
                Agent phone <span className="text-destructive">*</span>
              </label>
              <Input
                value={agentPhone}
                onChange={(e) => setAgentPhone(e.target.value)}
                placeholder="(941) 555-1234"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">
                Agent email <span className="text-destructive">*</span>
              </label>
              <Input
                value={agentEmail}
                onChange={(e) => setAgentEmail(e.target.value)}
                type="email"
                placeholder="brian@helgemoteam.com"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              Agent photo URL <span className="opacity-50">(optional)</span>
            </label>
            <Input
              value={agentPhotoUrl}
              onChange={(e) => setAgentPhotoUrl(e.target.value)}
              placeholder="https://example.com/headshot.jpg"
              type="url"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              "Schedule a Call" URL <span className="text-destructive">*</span>
            </label>
            <Input
              value={agentScheduleUrl}
              onChange={(e) => setAgentScheduleUrl(e.target.value)}
              placeholder="https://calendly.com/helgemoteam"
              type="url"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              Brand primary color <span className="opacity-50">(optional)</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                className="h-9 w-12 cursor-pointer border border-border bg-background p-0.5"
              />
              <Input
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                placeholder="#171717"
                className="max-w-[140px] font-mono text-xs"
              />
            </div>
          </div>
        </section>

        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}

        <div className="flex gap-3">
          <Button type="submit" disabled={submitting || loading} size="lg">
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : isEditing ? (
              "Update client"
            ) : (
              "Create client"
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => navigate("/dashboard/clients")}
            disabled={submitting}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
