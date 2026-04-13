import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { motion, type Variants } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, ArrowRight, ArrowLeft, CheckCircle, Loader2 } from "lucide-react";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 1, delay: i * 0.08, ease: EASE },
  }),
};

const stagger: Variants = {
  visible: { transition: { staggerChildren: 0.1 } },
};

export default function Login() {
  const { user, profile, loading, signInWithMagicLink } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    if (profile?.role === "admin") return <Navigate to="/dashboard" replace />;
    return <Navigate to="/account" replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signInWithMagicLink(email);
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send magic link");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-72px)] items-center justify-center bg-background px-8 py-20 md:px-12">
      <motion.div
        initial="hidden"
        animate="visible"
        variants={stagger}
        className="w-full max-w-md"
      >
        <motion.div variants={fadeUp}>
          <Link
            to="/"
            className="group inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
            <span className="label">Back to home</span>
          </Link>
        </motion.div>

        {sent ? (
          <>
            <motion.span variants={fadeUp} className="label mt-12 block text-muted-foreground">
              — Listing Elevate
            </motion.span>
            <motion.h1 variants={fadeUp} className="display-md mt-6 text-foreground">
              Check your inbox.
            </motion.h1>
            <motion.p
              variants={fadeUp}
              className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground"
            >
              Magic link sent to{" "}
              <span className="font-medium text-foreground">{email}</span>. Click
              the link in your email to finish signing in.
            </motion.p>
            <motion.div
              variants={fadeUp}
              className="mt-10 flex items-center gap-3 border border-accent/30 bg-accent/5 px-5 py-4"
            >
              <CheckCircle className="h-4 w-4 text-accent" />
              <span className="text-xs text-muted-foreground">
                Link valid for the next 60 minutes.
              </span>
            </motion.div>
            <motion.div variants={fadeUp} className="mt-8">
              <button
                type="button"
                onClick={() => {
                  setSent(false);
                  setEmail("");
                }}
                className="label text-muted-foreground transition-colors hover:text-foreground"
              >
                — Use a different email
              </button>
            </motion.div>
          </>
        ) : (
          <>
            <motion.span variants={fadeUp} className="label mt-12 block text-muted-foreground">
              — Listing Elevate
            </motion.span>
            <motion.h1 variants={fadeUp} className="display-md mt-6 text-foreground">
              Sign in.
            </motion.h1>
            <motion.p
              variants={fadeUp}
              className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground"
            >
              Enter your email to sign in.
            </motion.p>

            <motion.form
              variants={fadeUp}
              onSubmit={handleSubmit}
              className="mt-10 space-y-6"
            >
              <div className="space-y-3">
                <Label htmlFor="email" className="label text-muted-foreground">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@brokerage.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="pl-11"
                    autoFocus
                  />
                </div>
              </div>

              {error && (
                <p className="text-xs text-destructive">{error}</p>
              )}

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={submitting || !email}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Send magic link
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </motion.form>
          </>
        )}
      </motion.div>
    </div>
  );
}
