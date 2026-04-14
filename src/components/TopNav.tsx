import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, LayoutDashboard, UserCircle, Upload as UploadIcon, User } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { ThemeToggle } from "@/components/brand/ThemeToggle";

export function TopNav() {
  const { user, profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Index.tsx renders its own hero-style navigation with auth modal hookup.
  // Render nothing here on the landing page so the two don't stack.
  if (location.pathname === "/") return null;

  const isAdmin = profile?.role === "admin";

  async function handleSignOut() {
    await signOut();
    navigate("/");
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/55 backdrop-blur-2xl backdrop-saturate-150 supports-[backdrop-filter]:bg-background/40">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-6 md:h-[72px] md:px-10">
        <Wordmark size="md" />

        <nav className="flex items-center gap-2 md:gap-4">
          {user ? (
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
        </nav>
      </div>
    </header>
  );
}
