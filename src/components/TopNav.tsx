import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { User, LogOut, LayoutDashboard, UserCircle, Upload as UploadIcon } from "lucide-react";

export function TopNav() {
  const { user, profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isAdmin = profile?.role === "admin";
  const isHome = location.pathname === "/";

  async function handleSignOut() {
    await signOut();
    navigate("/");
  }

  return (
    <header
      className={`sticky top-0 z-50 w-full border-b ${
        isHome
          ? "border-white/10 bg-black/30 backdrop-blur-md"
          : "border-border bg-background/80 backdrop-blur-md"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 md:px-8 h-14 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2">
          <span
            className={`font-display text-lg md:text-xl font-semibold tracking-tight ${
              isHome ? "text-white" : "text-foreground"
            }`}
          >
            Listing Elevate
          </span>
        </Link>

        <nav className="flex items-center gap-2 md:gap-4">
          {user ? (
            <>
              <Link
                to="/upload"
                className={`hidden sm:inline text-[11px] md:text-xs tracking-[0.2em] uppercase font-medium transition-colors ${
                  isHome ? "text-white/80 hover:text-white" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Upload
              </Link>
              {isAdmin && (
                <Link
                  to="/dashboard"
                  className={`hidden sm:inline text-[11px] md:text-xs tracking-[0.2em] uppercase font-medium transition-colors ${
                    isHome ? "text-white/80 hover:text-white" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Dashboard
                </Link>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`rounded-full h-8 w-8 ${
                      isHome ? "hover:bg-white/10 text-white" : ""
                    }`}
                  >
                    <div
                      className={`h-7 w-7 rounded-full flex items-center justify-center ${
                        isHome ? "bg-white/15" : "bg-primary/15"
                      }`}
                    >
                      <User className={`h-4 w-4 ${isHome ? "text-white" : "text-primary"}`} />
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 py-1.5 text-xs text-muted-foreground truncate">{user.email}</div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/upload" className="cursor-pointer">
                      <UploadIcon className="mr-2 h-4 w-4" /> Upload
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
                    <LogOut className="mr-2 h-4 w-4" /> Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className={`text-[11px] md:text-xs tracking-[0.2em] uppercase font-medium transition-colors ${
                  isHome ? "text-white/80 hover:text-white" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Sign In
              </Link>
              <Button
                size="sm"
                className={`tracking-[0.2em] uppercase text-[11px] px-5 rounded-none font-medium ${
                  isHome
                    ? "bg-white text-foreground hover:bg-white/90"
                    : "bg-foreground text-background hover:bg-foreground/90"
                }`}
                asChild
              >
                <Link to="/login">Get Started</Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
