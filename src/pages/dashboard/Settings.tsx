import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, Save, Upload, Music, Bell, Loader2 } from "lucide-react";
import { toast } from "sonner";

type PrimaryVideoProvider = "auto" | "runway" | "kling" | "luma" | "higgsfield";

interface AppSettings {
  primary_video_provider: PrimaryVideoProvider;
}

const PRIMARY_PROVIDER_OPTIONS: Array<{ value: PrimaryVideoProvider; label: string; desc: string }> = [
  { value: "auto", label: "Auto (per-room routing)", desc: "Smart routing — use Runway for exteriors, Kling for interiors, Luma for pools. Recommended default." },
  { value: "higgsfield", label: "Higgsfield DoP", desc: "Director-of-Photography engine with first-last-frame keyframe support. Best for anchor-heavy interior shots." },
  { value: "kling", label: "Kling v2 Master", desc: "Highest interior fidelity. Cap parallel tasks via GENERATION_CONCURRENCY." },
  { value: "runway", label: "Runway Gen-4 Turbo", desc: "Most stable exteriors. Interior motion tends to default to push-in." },
  { value: "luma", label: "Luma Ray 2", desc: "Good for pools and outdoor movement. Keyframe bracketing supported." },
];

async function fetchAppSettings(): Promise<AppSettings> {
  const res = await fetch("/api/admin/settings");
  if (!res.ok) throw new Error(`GET /api/admin/settings → ${res.status}`);
  return res.json();
}

async function updateAppSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const res = await fetch("/api/admin/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`POST /api/admin/settings → ${res.status} ${txt}`);
  }
  const payload = (await res.json()) as { current: AppSettings };
  return payload.current;
}

const Settings = () => {
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [qcThreshold, setQcThreshold] = useState([0.75]);
  const [maxRetries, setMaxRetries] = useState([3]);
  const [autoApprove, setAutoApprove] = useState([0.9]);
  const [clipDuration, setClipDuration] = useState([3.5]);
  const [transitionDuration, setTransitionDuration] = useState([0.3]);

  const qc = useQueryClient();
  const appSettings = useQuery({
    queryKey: ["app-settings"],
    queryFn: fetchAppSettings,
  });
  const primaryProviderMutation = useMutation({
    mutationFn: (value: PrimaryVideoProvider) =>
      updateAppSettings({ primary_video_provider: value }),
    onSuccess: (current, variable) => {
      qc.setQueryData(["app-settings"], current);
      const option = PRIMARY_PROVIDER_OPTIONS.find((o) => o.value === variable);
      toast.success(`Primary provider set to ${option?.label ?? variable}`);
    },
    onError: (err: Error) => {
      toast.error(`Failed to update primary provider: ${err.message}`);
    },
  });

  const toggleKey = (key: string) => setShowKeys(prev => ({ ...prev, [key]: !prev[key] }));

  const handleSave = (section: string) => {
    toast.success(`${section} saved successfully`);
  };

  const currentPrimaryProvider = appSettings.data?.primary_video_provider ?? "auto";

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Primary Video Provider — live, wired to /api/admin/settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Primary Video Provider</CardTitle>
          <CardDescription>
            Overrides the router's per-room-type defaults. Takes effect on the next property run — no redeploy needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {appSettings.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading current setting…
            </div>
          ) : appSettings.isError ? (
            <div className="text-sm text-destructive">
              Failed to load settings: {(appSettings.error as Error).message}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Active provider</Label>
                <Select
                  value={currentPrimaryProvider}
                  onValueChange={(v) =>
                    primaryProviderMutation.mutate(v as PrimaryVideoProvider)
                  }
                  disabled={primaryProviderMutation.isPending}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIMARY_PROVIDER_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {
                    PRIMARY_PROVIDER_OPTIONS.find(
                      (o) => o.value === currentPrimaryProvider
                    )?.desc
                  }
                </p>
              </div>
              {primaryProviderMutation.isPending && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* API Keys */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">API Keys</CardTitle>
          <CardDescription>Configure video generation provider credentials</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {["Runway", "Kling", "Luma", "Higgsfield"].map(provider => (
            <div key={provider} className="space-y-2">
              <Label>{provider} API Key</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showKeys[provider] ? "text" : "password"}
                    placeholder={`Enter ${provider} API key...`}
                    defaultValue="sk-••••••••••••••••"
                    className="font-mono pr-10"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full w-10"
                    onClick={() => toggleKey(provider)}
                  >
                    {showKeys[provider] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <Button variant="outline" size="sm" className="gap-1" onClick={() => handleSave(provider)}>
                  <Save className="h-3 w-3" /> Save
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Provider Routing (informational — real routing is the Primary Provider card above) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Provider Fallback Chain</CardTitle>
          <CardDescription>Retry order when the primary provider fails on a scene</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {["Runway", "Kling", "Luma", "Higgsfield"].map((provider, i) => (
            <div key={provider} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="font-mono text-xs">{i + 1}</Badge>
                <span className="text-sm font-medium">{provider}</span>
              </div>
              <Switch defaultChecked={i < 3} />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Quality Thresholds */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quality Thresholds</CardTitle>
          <CardDescription>Configure automated quality control parameters</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex justify-between">
              <Label>QC Confidence Threshold</Label>
              <span className="font-mono text-sm text-muted-foreground">{qcThreshold[0].toFixed(2)}</span>
            </div>
            <Slider value={qcThreshold} onValueChange={setQcThreshold} min={0} max={1} step={0.05} />
          </div>
          <div className="space-y-3">
            <div className="flex justify-between">
              <Label>Max Retries per Clip</Label>
              <span className="font-mono text-sm text-muted-foreground">{maxRetries[0]}</span>
            </div>
            <Slider value={maxRetries} onValueChange={setMaxRetries} min={1} max={5} step={1} />
          </div>
          <div className="space-y-3">
            <div className="flex justify-between">
              <Label>Auto-Approve Threshold</Label>
              <span className="font-mono text-sm text-muted-foreground">{autoApprove[0].toFixed(2)}</span>
            </div>
            <Slider value={autoApprove} onValueChange={setAutoApprove} min={0} max={1} step={0.05} />
          </div>
          <Button onClick={() => handleSave("Quality thresholds")} className="w-full">Save Thresholds</Button>
        </CardContent>
      </Card>

      {/* Cost Alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cost Alerts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Daily Budget Cap ($)</Label>
            <Input type="number" defaultValue="50" className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label>Email Alert Threshold ($)</Label>
            <Input type="number" defaultValue="40" className="font-mono" />
          </div>
          <Button onClick={() => handleSave("Cost alerts")} className="w-full">Save</Button>
        </CardContent>
      </Card>

      {/* Video Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Video Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex justify-between">
              <Label>Default Clip Duration</Label>
              <span className="font-mono text-sm text-muted-foreground">{clipDuration[0].toFixed(1)}s</span>
            </div>
            <Slider value={clipDuration} onValueChange={setClipDuration} min={2} max={5} step={0.5} />
          </div>
          <div className="space-y-3">
            <div className="flex justify-between">
              <Label>Transition Duration</Label>
              <span className="font-mono text-sm text-muted-foreground">{transitionDuration[0].toFixed(1)}s</span>
            </div>
            <Slider value={transitionDuration} onValueChange={setTransitionDuration} min={0.1} max={1} step={0.1} />
          </div>
          <div className="space-y-2">
            <Label>Output Resolution</Label>
            <Select defaultValue="1080p">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="720p">720p</SelectItem>
                <SelectItem value="1080p">1080p</SelectItem>
                <SelectItem value="4k">4K</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => handleSave("Video settings")} className="w-full">Save</Button>
        </CardContent>
      </Card>

      {/* Music Library */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Music className="h-4 w-4" /> Music Library
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { name: "Ambient Dreams", duration: "2:34", mood: "Calm" },
            { name: "Modern Living", duration: "3:12", mood: "Upbeat" },
            { name: "Luxury Estate", duration: "2:48", mood: "Elegant" },
          ].map(track => (
            <div key={track.name} className="flex items-center justify-between border border-border rounded-lg p-3">
              <div>
                <p className="text-sm font-medium">{track.name}</p>
                <p className="text-xs text-muted-foreground font-mono">{track.duration}</p>
              </div>
              <Badge variant="secondary">{track.mood}</Badge>
            </div>
          ))}
          <Button variant="outline" className="w-full gap-2"><Upload className="h-4 w-4" /> Upload Track</Button>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4" /> Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { label: "Video Complete", desc: "Email when a video finishes processing" },
            { label: "Pipeline Failure", desc: "Alert when a property fails" },
            { label: "Daily Summary", desc: "End-of-day stats digest" },
          ].map(n => (
            <div key={n.label} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{n.label}</p>
                <p className="text-xs text-muted-foreground">{n.desc}</p>
              </div>
              <Switch defaultChecked />
            </div>
          ))}
          <div className="space-y-2 pt-2 border-t border-border">
            <Label>Webhook URL</Label>
            <Input placeholder="https://..." className="font-mono" />
          </div>
          <Button onClick={() => handleSave("Notifications")} className="w-full">Save</Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;
