import { useState, useEffect, useRef } from "react";
import { motion, type Variants } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Upload, Loader2 } from "lucide-react";

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

const DEFAULT_PRIMARY = "#2864F0"; // electric blue accent — replaces off-brand emerald
const DEFAULT_SECONDARY = "#ffffff";

export default function AccountProfile() {
  const { profile, refreshProfile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [localLogoPreview, setLocalLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
    brokerage: "",
    colors: { primary: DEFAULT_PRIMARY, secondary: DEFAULT_SECONDARY },
  });

  useEffect(() => {
    if (profile) {
      setForm({
        first_name: profile.first_name || "",
        last_name: profile.last_name || "",
        phone: profile.phone || "",
        email: profile.email || "",
        brokerage: profile.brokerage || "",
        colors: profile.colors || { primary: DEFAULT_PRIMARY, secondary: DEFAULT_SECONDARY },
      });
    }
  }, [profile]);

  // Clean up object URLs to avoid leaks
  useEffect(() => {
    return () => {
      if (localLogoPreview) URL.revokeObjectURL(localLogoPreview);
    };
  }, [localLogoPreview]);

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

    // Show local preview immediately, before/while the upload runs
    const previewUrl = URL.createObjectURL(file);
    setLocalLogoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return previewUrl;
    });

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
      if (localLogoPreview) {
        URL.revokeObjectURL(localLogoPreview);
        setLocalLogoPreview(null);
      }
      await refreshProfile();
      toast.success("Logo removed");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to remove logo");
    }
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  const displayedLogo = localLogoPreview || profile?.logo_url || null;

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={stagger}
      className="max-w-3xl"
    >
      {/* Title block */}
      <motion.div variants={fadeUp}>
        <span className="label text-muted-foreground">— Branding</span>
        <h1 className="display-md font-display mt-5 text-foreground">
          Personalize your videos.
        </h1>
        <p className="mt-6 max-w-xl text-sm leading-relaxed text-muted-foreground md:text-base">
          Your name, logo, and brand colours appear on every video the engine produces.
        </p>
      </motion.div>

      {/* Hidden global file input — shared between empty-state + Replace button */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleLogoUpload}
        disabled={uploading}
      />

      <form onSubmit={handleSave} className="mt-20 space-y-16">
        {/* ─── Contact ─── */}
        <motion.section variants={fadeUp} className="space-y-8">
          <div className="flex items-center gap-4">
            <span className="label text-muted-foreground">— Contact</span>
            <span className="h-px flex-1 bg-border" aria-hidden />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <Label htmlFor="first_name" className="label text-muted-foreground">
                First name
              </Label>
              <Input
                id="first_name"
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                className="h-12 rounded-none"
              />
            </div>
            <div className="space-y-3">
              <Label htmlFor="last_name" className="label text-muted-foreground">
                Last name
              </Label>
              <Input
                id="last_name"
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                className="h-12 rounded-none"
              />
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <Label htmlFor="email" className="label text-muted-foreground">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="h-12 rounded-none"
              />
            </div>
            <div className="space-y-3">
              <Label htmlFor="phone" className="label text-muted-foreground">
                Phone
              </Label>
              <Input
                id="phone"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+1 (555) 000-0000"
                className="h-12 rounded-none"
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label htmlFor="brokerage" className="label text-muted-foreground">
              Brokerage
            </Label>
            <Input
              id="brokerage"
              value={form.brokerage}
              onChange={(e) => setForm({ ...form, brokerage: e.target.value })}
              placeholder="Compass, Keller Williams…"
              className="h-12 rounded-none"
            />
          </div>
        </motion.section>

        {/* ─── Logo ─── */}
        <motion.section variants={fadeUp} className="space-y-8">
          <div className="flex items-center gap-4">
            <span className="label text-muted-foreground">— Logo</span>
            <span className="h-px flex-1 bg-border" aria-hidden />
          </div>

          {displayedLogo ? (
            <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
              <div className="relative flex h-24 w-24 items-center justify-center border border-border bg-muted/40 p-2">
                <img
                  src={displayedLogo}
                  alt="Brand logo"
                  className="h-full w-full object-contain"
                />
                {uploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                    <Loader2 className="h-4 w-4 animate-spin text-foreground" />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-6">
                <button
                  type="button"
                  onClick={openFilePicker}
                  disabled={uploading}
                  className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:text-accent disabled:opacity-50"
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={handleLogoRemove}
                  disabled={uploading}
                  className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:text-accent disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={openFilePicker}
              disabled={uploading}
              className="group flex w-full flex-col items-center justify-center gap-4 border border-dashed border-border p-12 text-center transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-foreground disabled:opacity-50"
            >
              <div className="flex h-10 w-10 items-center justify-center border border-border text-muted-foreground transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:border-foreground group-hover:text-foreground">
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
              </div>
              <span className="font-display text-base font-semibold tracking-[-0.01em] text-foreground">
                Upload logo.
              </span>
              <span className="text-xs text-muted-foreground">
                PNG or SVG. Transparent backgrounds preferred.
              </span>
            </button>
          )}
        </motion.section>

        {/* ─── Brand colours ─── */}
        <motion.section variants={fadeUp} className="space-y-8">
          <div className="flex items-center gap-4">
            <span className="label text-muted-foreground">— Brand colours</span>
            <span className="h-px flex-1 bg-border" aria-hidden />
          </div>

          <div className="grid gap-10 md:grid-cols-2">
            <div className="space-y-4">
              <Label htmlFor="color_primary" className="label text-muted-foreground">
                Primary
              </Label>
              <div className="flex items-center gap-5">
                <label
                  htmlFor="color_primary"
                  className="relative h-14 w-14 cursor-pointer border border-border transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-foreground"
                  style={{ backgroundColor: form.colors.primary }}
                >
                  <input
                    type="color"
                    id="color_primary"
                    value={form.colors.primary}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        colors: { ...form.colors, primary: e.target.value },
                      })
                    }
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                </label>
                <Input
                  value={form.colors.primary}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      colors: { ...form.colors, primary: e.target.value },
                    })
                  }
                  className="h-12 max-w-[10rem] rounded-none font-mono text-sm uppercase"
                />
              </div>
            </div>

            <div className="space-y-4">
              <Label htmlFor="color_secondary" className="label text-muted-foreground">
                Secondary
              </Label>
              <div className="flex items-center gap-5">
                <label
                  htmlFor="color_secondary"
                  className="relative h-14 w-14 cursor-pointer border border-border transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-foreground"
                  style={{ backgroundColor: form.colors.secondary }}
                >
                  <input
                    type="color"
                    id="color_secondary"
                    value={form.colors.secondary}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        colors: { ...form.colors, secondary: e.target.value },
                      })
                    }
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                </label>
                <Input
                  value={form.colors.secondary}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      colors: { ...form.colors, secondary: e.target.value },
                    })
                  }
                  className="h-12 max-w-[10rem] rounded-none font-mono text-sm uppercase"
                />
              </div>
            </div>
          </div>
        </motion.section>

        {/* ─── Save ─── */}
        <motion.div variants={fadeUp} className="pt-4">
          <Button type="submit" size="lg" disabled={saving} className="w-full">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </motion.div>
      </form>
    </motion.div>
  );
}
