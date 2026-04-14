import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, ArrowRight, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { Wordmark } from "@/components/brand/Wordmark";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send magic link");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-1 bg-background text-foreground md:grid-cols-2">
      {/* Left — editorial copy panel */}
      <div className="relative hidden flex-col justify-between border-r border-border bg-secondary/30 px-12 py-12 md:flex">
        <Wordmark size="lg" />
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: EASE, delay: 0.1 }}
          className="max-w-md"
        >
          <span className="label text-muted-foreground">— Listing Elevate</span>
          <h1 className="display-lg mt-6">
            Cinema for
            <br />
            <span className="text-muted-foreground">every listing.</span>
          </h1>
          <p className="mt-8 text-sm leading-relaxed text-muted-foreground">
            Sign in to access your video library, manage in-flight productions, and submit new listings.
          </p>
        </motion.div>
        <Link
          to="/"
          className="label inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Back to home
        </Link>
      </div>

      {/* Right — form */}
      <div className="flex flex-col justify-between px-8 py-10 md:px-16 md:py-16">
        <div className="flex items-center justify-between md:hidden">
          <Wordmark size="md" />
          <Link to="/" className="label text-muted-foreground">
            Home
          </Link>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: EASE }}
          className="mx-auto w-full max-w-sm flex-1 self-center pt-12 md:pt-0"
        >
          <span className="label text-muted-foreground">— Sign in</span>
          <h2 className="mt-4 text-2xl font-semibold tracking-[-0.02em] md:text-3xl">
            Welcome back.
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Enter your email — we'll send a one-time link.
          </p>

          {sent ? (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE }}
              className="mt-12 border border-accent/30 bg-accent/5 p-8"
            >
              <div className="flex h-12 w-12 items-center justify-center border border-accent/40 bg-accent/10 text-accent">
                <CheckCircle2 className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <h3 className="mt-6 text-lg font-semibold tracking-[-0.01em]">Check your inbox.</h3>
              <p className="mt-3 text-sm text-muted-foreground">
                Magic link sent to <span className="font-medium text-foreground">{email}</span>. Click it to sign in.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSent(false);
                  setEmail("");
                }}
                className="mt-6 text-xs text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
              >
                Use a different email
              </button>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-12 space-y-6">
              <div>
                <Label htmlFor="email" className="label text-muted-foreground">
                  Email
                </Label>
                <div className="relative mt-3">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@brokerage.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    className="pl-11"
                  />
                </div>
              </div>

              {error && (
                <div className="border border-destructive/40 bg-destructive/5 p-4">
                  <p className="text-xs text-destructive">{error}</p>
                </div>
              )}

              <Button type="submit" size="lg" className="w-full" disabled={submitting || !email}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Sending
                  </>
                ) : (
                  <>
                    Send magic link
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                Don't have an account?{" "}
                <Link to="/" className="text-foreground underline underline-offset-4">
                  Sign up on the home page
                </Link>
              </p>
            </form>
          )}
        </motion.div>

        <p className="label mt-12 text-muted-foreground/70">© 2026 Listing Elevate</p>
      </div>
    </div>
  );
}
