import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, ArrowRight } from "lucide-react";
import { motion, type Variants } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

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

export default function AuthCallback() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let resolved = false;

    const goNext = () => {
      if (resolved) return;
      resolved = true;
      if (profile?.role === "admin") {
        navigate("/dashboard", { replace: true });
      } else {
        navigate("/account", { replace: true });
      }
    };

    // Try the existing session first
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) goNext();
    });

    // Subscribe for the auth state event that fires after the magic-link exchange
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) goNext();
    });

    // Failure timeout — if no session shows up, surface an error
    const timeout = setTimeout(() => {
      if (!resolved) setFailed(true);
    }, 3500);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [navigate, profile]);

  return (
    <div className="flex min-h-[calc(100vh-72px)] items-center justify-center bg-background px-8 py-20 md:px-12">
      <motion.div
        initial="hidden"
        animate="visible"
        variants={stagger}
        className="mx-auto flex max-w-xl flex-col items-start"
      >
        {failed ? (
          <>
            <motion.span variants={fadeUp} className="label text-muted-foreground">
              — Sign-in failed
            </motion.span>
            <motion.h1 variants={fadeUp} className="display-md mt-6 text-foreground">
              Something went wrong.
            </motion.h1>
            <motion.p
              variants={fadeUp}
              className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground"
            >
              We couldn't complete sign-in. Your magic link may have expired or
              already been used. Request a new one and try again.
            </motion.p>
            <motion.div variants={fadeUp} className="mt-12">
              <Button asChild size="lg" variant="outline">
                <Link to="/login">
                  Back to sign in
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </motion.div>
          </>
        ) : (
          <>
            <motion.span variants={fadeUp} className="label text-muted-foreground">
              — Signing you in
            </motion.span>
            <motion.h1 variants={fadeUp} className="display-md mt-6 text-foreground">
              Just a moment.
            </motion.h1>
            <motion.p
              variants={fadeUp}
              className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground"
            >
              Verifying your magic link and loading your account.
            </motion.p>
            <motion.div
              variants={fadeUp}
              className="mt-12 flex items-center gap-3 text-muted-foreground"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="label">— One second</span>
            </motion.div>
          </>
        )}
      </motion.div>
    </div>
  );
}
