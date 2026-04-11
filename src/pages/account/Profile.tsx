import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Save, Upload, Trash2 } from "lucide-react";

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
    colors: { primary: "#10b981", secondary: "#ffffff" },
  });

  useEffect(() => {
    if (profile) {
      setForm({
        first_name: profile.first_name || "",
        last_name: profile.last_name || "",
        phone: profile.phone || "",
        email: profile.email || "",
        brokerage: profile.brokerage || "",
        colors: profile.colors || { primary: "#10b981", secondary: "#ffffff" },
      });
    }
  }, [profile]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { error } = await supabase
        .from("user_profiles")
        .update({
          ...form,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", profile!.user_id);
      if (error) throw error;
      await refreshProfile();
      toast.success("Profile saved");
    } catch (err: unknown) {
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
    } catch (err: unknown) {
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
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to remove logo");
    }
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight">Video Information</h1>
      <p className="text-muted-foreground">
        This info is used in your generated videos — branding overlays, contact details, and visual style.
      </p>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Contact Info */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Contact Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="first_name">First Name</Label>
              <Input
                id="first_name"
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Last Name</Label>
              <Input
                id="last_name"
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+1 (555) 000-0000"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="brokerage">Brokerage</Label>
            <Input
              id="brokerage"
              value={form.brokerage}
              onChange={(e) => setForm({ ...form, brokerage: e.target.value })}
              placeholder="e.g. Compass, Keller Williams"
            />
          </div>
        </div>

        {/* Logo */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Logo</h2>
          <p className="text-sm text-muted-foreground">
            Your logo will be overlaid on generated videos.
          </p>
          <div className="flex items-center gap-4">
            {profile?.logo_url ? (
              <div className="flex items-center gap-4">
                <img
                  src={profile.logo_url}
                  alt="Logo"
                  className="h-16 w-16 object-contain rounded-lg border border-border bg-muted p-1"
                />
                <Button type="button" variant="outline" size="sm" onClick={handleLogoRemove}>
                  <Trash2 className="h-4 w-4 mr-1" />
                  Remove
                </Button>
              </div>
            ) : (
              <label className="cursor-pointer">
                <div className="flex items-center gap-2 px-4 py-2 rounded-md border border-border hover:bg-muted transition-colors text-sm">
                  <Upload className="h-4 w-4" />
                  {uploading ? "Uploading..." : "Upload Logo"}
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
        </div>

        {/* Brand Colors */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Brand Colors</h2>
          <p className="text-sm text-muted-foreground">
            Used for text overlays and accent elements in your videos.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="color_primary">Primary Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  id="color_primary"
                  value={form.colors.primary}
                  onChange={(e) =>
                    setForm({ ...form, colors: { ...form.colors, primary: e.target.value } })
                  }
                  className="h-10 w-10 rounded border border-border cursor-pointer"
                />
                <Input
                  value={form.colors.primary}
                  onChange={(e) =>
                    setForm({ ...form, colors: { ...form.colors, primary: e.target.value } })
                  }
                  className="font-mono"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="color_secondary">Secondary Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  id="color_secondary"
                  value={form.colors.secondary}
                  onChange={(e) =>
                    setForm({ ...form, colors: { ...form.colors, secondary: e.target.value } })
                  }
                  className="h-10 w-10 rounded border border-border cursor-pointer"
                />
                <Input
                  value={form.colors.secondary}
                  onChange={(e) =>
                    setForm({ ...form, colors: { ...form.colors, secondary: e.target.value } })
                  }
                  className="font-mono"
                />
              </div>
            </div>
          </div>
        </div>

        <Button type="submit" disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </form>
    </div>
  );
}
