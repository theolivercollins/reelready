import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Upload, Trash2, Loader2 } from "lucide-react";

export default function AccountProfile() {
  const { profile, refreshProfile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
    brokerage: "",
    colors: { primary: "#2563eb", secondary: "#ffffff" },
  });

  useEffect(() => {
    if (profile) {
      setForm({
        first_name: profile.first_name || "",
        last_name: profile.last_name || "",
        phone: profile.phone || "",
        email: profile.email || "",
        brokerage: profile.brokerage || "",
        colors: profile.colors || { primary: "#2563eb", secondary: "#ffffff" },
      });
    }
  }, [profile]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { error } = await supabase
        .from("user_profiles")
        .update({ ...form, updated_at: new Date().toISOString() })
        .eq("user_id", profile!.user_id);
      if (error) throw error;
      await refreshProfile();
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${profile!.user_id}/logo.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("user-logos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from("user-logos").getPublicUrl(path);
      const { error: updateErr } = await supabase
        .from("user_profiles")
        .update({ logo_url: urlData.publicUrl, updated_at: new Date().toISOString() })
        .eq("user_id", profile!.user_id);
      if (updateErr) throw updateErr;
      await refreshProfile();
      toast.success("Logo uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleLogoRemove() {
    try {
      const { error } = await supabase
        .from("user_profiles")
        .update({ logo_url: null, updated_at: new Date().toISOString() })
        .eq("user_id", profile!.user_id);
      if (error) throw error;
      await refreshProfile();
      toast.success("Logo removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove logo");
    }
  }

  return (
    <div className="space-y-16">
      <div>
        <span className="label text-muted-foreground">— Brand</span>
        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.02em]">Personalize your videos.</h2>
        <p className="mt-3 max-w-md text-sm text-muted-foreground">
          The information below appears in every generated video — your name, contact, brokerage, logo, and palette.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-16">
        {/* Contact */}
        <section>
          <span className="label text-muted-foreground">— Contact</span>
          <div className="mt-8 space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <Label htmlFor="first_name" className="label text-muted-foreground">First name</Label>
                <Input
                  id="first_name"
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                  className="mt-3"
                />
              </div>
              <div>
                <Label htmlFor="last_name" className="label text-muted-foreground">Last name</Label>
                <Input
                  id="last_name"
                  value={form.last_name}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                  className="mt-3"
                />
              </div>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <Label htmlFor="email" className="label text-muted-foreground">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="mt-3"
                />
              </div>
              <div>
                <Label htmlFor="phone" className="label text-muted-foreground">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+1 (555) 000-0000"
                  className="mt-3"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="brokerage" className="label text-muted-foreground">Brokerage</Label>
              <Input
                id="brokerage"
                value={form.brokerage}
                onChange={(e) => setForm({ ...form, brokerage: e.target.value })}
                placeholder="Compass, Keller Williams…"
                className="mt-3"
              />
            </div>
          </div>
        </section>

        {/* Logo */}
        <section>
          <span className="label text-muted-foreground">— Logo</span>
          <p className="mt-3 max-w-md text-sm text-muted-foreground">
            Overlaid on every generated video. PNG with transparency works best.
          </p>
          <div className="mt-8 flex items-center gap-6">
            {profile?.logo_url ? (
              <>
                <div className="flex h-24 w-24 items-center justify-center border border-border bg-secondary p-3">
                  <img src={profile.logo_url} alt="Logo" className="h-full w-full object-contain" />
                </div>
                <Button type="button" variant="outline" size="sm" onClick={handleLogoRemove}>
                  <Trash2 className="h-4 w-4" /> Remove
                </Button>
              </>
            ) : (
              <label className="cursor-pointer">
                <div className="flex h-24 w-24 items-center justify-center border border-dashed border-border bg-secondary/30 text-muted-foreground transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-foreground/40 hover:text-foreground">
                  {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" strokeWidth={1.5} />}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoUpload}
                  disabled={uploading}
                />
              </label>
            )}
          </div>
        </section>

        {/* Brand colors */}
        <section>
          <span className="label text-muted-foreground">— Palette</span>
          <p className="mt-3 max-w-md text-sm text-muted-foreground">
            Used for text overlays and accent moments in the final cut.
          </p>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {([
              { key: "primary" as const, label: "Primary" },
              { key: "secondary" as const, label: "Secondary" },
            ]).map(({ key, label }) => (
              <div key={key}>
                <Label className="label text-muted-foreground">{label}</Label>
                <div className="mt-3 flex items-stretch gap-0">
                  <label className="relative h-11 w-16 shrink-0 cursor-pointer border border-border" style={{ backgroundColor: form.colors[key] }}>
                    <input
                      type="color"
                      value={form.colors[key]}
                      onChange={(e) => setForm({ ...form, colors: { ...form.colors, [key]: e.target.value } })}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    />
                  </label>
                  <Input
                    value={form.colors[key]}
                    onChange={(e) => setForm({ ...form, colors: { ...form.colors, [key]: e.target.value } })}
                    className="tabular -ml-px"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="flex items-center gap-3 border-t border-border pt-10">
          <Button type="submit" size="lg" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Saving
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
