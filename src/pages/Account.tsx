import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth";

export const navItems = [
  { to: "/account/properties", label: "Properties" },
  { to: "/account/billing", label: "Billing" },
  { to: "/account/profile", label: "Branding" },
];

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

export default function Account() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  // Kept for parity with TopNav signout flow — the shell may still need it.
  async function handleSignOut() {
    await signOut();
    navigate("/");
  }
  void handleSignOut;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Editorial sub-nav — hairline, content-aligned */}
      <div className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-8 md:px-12">
          <nav className="flex items-center gap-10">
            {navItems.map(({ to, label }) => (
              <NavLink key={to} to={to} end>
                {({ isActive }) => (
                  <span
                    className={`relative inline-block py-2 text-[11px] font-medium uppercase tracking-[0.18em] transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                      isActive
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                    {isActive && (
                      <motion.span
                        layoutId="account-tab-underline"
                        className="absolute inset-x-0 -bottom-[15px] h-[2px] bg-foreground"
                        transition={{ duration: 0.5, ease: EASE }}
                      />
                    )}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>

      {/* Page content — each sub-page leads with its own title */}
      <main className="mx-auto max-w-6xl px-8 py-16 md:px-12">
        <Outlet />
      </main>
    </div>
  );
}
