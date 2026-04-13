import { Outlet, NavLink } from "react-router-dom";
import { motion } from "framer-motion";

const navItems = [
  { to: "/dashboard", label: "Overview", end: true },
  { to: "/dashboard/pipeline", label: "Pipeline", end: false },
  { to: "/dashboard/properties", label: "Properties", end: false },
  { to: "/dashboard/logs", label: "Logs", end: false },
  { to: "/dashboard/settings", label: "Settings", end: false },
];

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const Dashboard = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Editorial sub-nav — hairline, content-aligned */}
      <div className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center px-8 md:px-12">
          <nav className="flex items-center gap-10 overflow-x-auto">
            {navItems.map(({ to, label, end }) => (
              <NavLink key={to} to={to} end={end}>
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
                        layoutId="dashboard-tab-underline"
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
      <main className="mx-auto max-w-[1440px] px-8 py-12 md:px-12">
        <Outlet />
      </main>
    </div>
  );
};

export default Dashboard;
