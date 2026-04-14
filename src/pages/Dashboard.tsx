import { Outlet, NavLink } from "react-router-dom";
import { LayoutGrid, GitBranch, Building2, FileText, Settings as SettingsIcon } from "lucide-react";

const navItems = [
  { to: "/dashboard", label: "Overview", icon: LayoutGrid, end: true },
  { to: "/dashboard/pipeline", label: "Pipeline", icon: GitBranch },
  { to: "/dashboard/properties", label: "Listings", icon: Building2 },
  { to: "/dashboard/logs", label: "Logs", icon: FileText },
  { to: "/dashboard/settings", label: "Settings", icon: SettingsIcon },
];

const Dashboard = () => {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <div className="border-b border-border">
        <div className="mx-auto flex max-w-[1440px] items-end justify-between gap-6 px-8 pb-6 pt-12 md:px-12">
          <div>
            <span className="label text-muted-foreground">— Operations</span>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.02em] md:text-4xl">Studio control</h1>
          </div>
        </div>
        <nav className="mx-auto flex max-w-[1440px] items-center gap-8 overflow-x-auto px-8 md:px-12">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `relative flex items-center gap-2 whitespace-nowrap py-4 text-[11px] font-medium uppercase tracking-[0.18em] transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                } ${isActive ? "after:absolute after:inset-x-0 after:bottom-[-1px] after:h-[1px] after:bg-foreground" : ""}`
              }
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-8 py-16 md:px-12 md:py-20">
        <Outlet />
      </main>
    </div>
  );
};

export default Dashboard;
