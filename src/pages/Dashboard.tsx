import { Outlet, Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Overview", path: "/dashboard" },
  { label: "Pipeline", path: "/dashboard/pipeline" },
  { label: "Properties", path: "/dashboard/properties" },
  { label: "Logs", path: "/dashboard/logs" },
  { label: "Settings", path: "/dashboard/settings" },
];

const Dashboard = () => {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === "/dashboard") return location.pathname === "/dashboard";
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Section nav */}
      <div className="border-b border-border px-6 h-12 flex items-center shrink-0">
        <nav className="flex items-center gap-1 overflow-x-auto">
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors",
                isActive(item.path)
                  ? "bg-accent text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* Content */}
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
};

export default Dashboard;
