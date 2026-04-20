import { Outlet } from "react-router-dom";

/**
 * Dashboard shell — the sub-nav now lives in TopNav so this is just a
 * container for the current route's <Outlet />.
 */
const Dashboard = () => {
  return (
    <div className="le-root min-h-screen bg-background text-foreground">
      <main className="mx-auto w-full max-w-[1440px] px-8 py-12 md:px-12 md:py-16">
        <Outlet />
      </main>
    </div>
  );
};

export default Dashboard;
