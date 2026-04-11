import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // Wait a tick for profile to load via auth state change
        setTimeout(() => {
          if (profile?.role === "admin") {
            navigate("/dashboard", { replace: true });
          } else {
            navigate("/account", { replace: true });
          }
        }, 500);
      } else {
        navigate("/login", { replace: true });
      }
    });
  }, [navigate, profile]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="animate-spin h-8 w-8 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto" />
        <p className="text-sm text-muted-foreground">Signing you in...</p>
      </div>
    </div>
  );
}
