import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LogOut,
  LayoutDashboard,
  UserCircle,
  Upload as UploadIcon,
  User,
  LayoutGrid,
  GitBranch,
  Building2,
  FileText,
  Settings as SettingsIcon,
} from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { ThemeToggle } from "@/components/brand/ThemeToggle";

const dashboardNav = [
  { to: "/dashboard", label: "Overview", icon: LayoutGrid, end: true },
  { to: "/dashboard/pipeline", label: "Pipeline", icon: GitBranch },
  { to: "/dashboard/properties", label: "Listings", icon: Building2 },
  { to: "/dashboard/logs", label: "Logs", icon: FileText },
  { to: "/dashboard/settings", label: "Settings", icon: SettingsIcon },
];

export function TopNav() {
  const { user, profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Index.tsx renders its own hero-style navigation with auth modal hookup.
  if (location.pathname === "/") return null;

  const isAdmin = profile?.role === "admin";
  const inDashboard = location.pathname.startsWith("/dashboard");

  async function handleSignOut() {
    await signOut();
    navigate("/");
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/55 backdrop-blur-2xl backdrop-saturate-150 supports-[backdrop-filter]:bg-background/40">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-4 px-6 md:h-[72px] md:px-10">
        {/* Brand */}
        {inDashboard ? (
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2.5 text-foreground transition-opacity hover:opacity-80"
            aria-label="Listing Elevate Studio"
          >
            <span className="relative inline-block h-6 w-6" aria-hidden>
              <svg viewBox="0 0 24 24" className="h-full w-full" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="1" y="1" width="22" height="22" stroke="currentColor" strokeWidth="1.5" />
                <rect x="5" y="14" width="3" height="5" fill="currentColor" />
                <rect x="10.5" y="10" width="3" height="9" fill="currentColor" />
                <rect x="16" y="6" width="3" height="13" fill="currentColor" />
              </svg>
            </span>
            <span className="flex items-baseline gap-2 text-base font-semibold leading-none tracking-[-0.01em]">
              Listing<span className="text-accent">.</span>Elevate
              <span className="h-3 w-px bg-border" />
              <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Studio
              </span>
            </span>
          </Link>
        ) : (
          <Wordmark size="md" />
        )}

        {/* Dashboard sub-nav — lives in the header when we're in /dashboard */}
        {inDashboard && isAdmin && (
          <nav className="ml-10 hidden items-center gap-8 md:flex">
            {dashboardNav.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `relative flex items-center gap-2 whitespace-nowrap py-[26px] text-[11px] font-medium uppercase tracking-[0.18em] transition-colors duration-500 ease-cinematic ${
                    isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  } ${
                    isActive
                      ? "after:absolute after:inset-x-0 after:bottom-[-1px] after:h-[1px] after:bg-foreground"
                      : ""
                  }`
                }
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
                {label}
              </NavLink>
            ))}
          </nav>
        )}

        <div className="ml-auto flex items-center gap-2 md:gap-4">
          {user ? (
            <>
              {!inDashboard && (
                <>
                  <Link
                    to="/upload"
                    className="label hidden text-muted-foreground transition-colors hover:text-foreground sm:inline"
                  >
                    New video
                  </Link>
                  {isAdmin && (
                    <Link
                      to="/dashboard"
                      className="label hidden text-muted-foreground transition-colors hover:text-foreground sm:inline"
                    >
                      Dashboard
                    </Link>
                  )}
                </>
              )}
              {inDashboard && (
                <Button asChild size="sm" variant="outline">
                  <Link to="/upload">
                    <UploadIcon className="h-3.5 w-3.5" /> New video
                  </Link>
                </Button>
              )}
              <ThemeToggle className="ml-2" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="ml-1 flex h-9 w-9 items-center justify-center border border-border text-foreground transition-all duration-500 ease-cinematic hover:border-foreground/40 hover:bg-secondary"
                    aria-label="Account menu"
                  >
                    <User className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <div className="label truncate px-3 py-2 text-muted-foreground">{user.email}</div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/upload" className="cursor-pointer">
                      <UploadIcon className="mr-2 h-4 w-4" /> New video
                    </Link>
                  </DropdownMenuItem>
                  {isAdmin ? (
                    <DropdownMenuItem asChild>
                      <Link to="/dashboard" className="cursor-pointer">
                        <LayoutDashboard className="mr-2 h-4 w-4" /> Dashboard
                      </Link>
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem asChild>
                      <Link to="/account" className="cursor-pointer">
                        <UserCircle className="mr-2 h-4 w-4" /> Account
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={handleSignOut} className="cursor-pointer">
                    <LogOut className="mr-2 h-4 w-4" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <ThemeToggle />
              <Link
                to="/login"
                className="label hidden text-muted-foreground transition-colors hover:text-foreground md:inline"
              >
                Sign in
              </Link>
              <Button asChild size="sm">
                <Link to="/login">Get started</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
