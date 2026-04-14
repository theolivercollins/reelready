import { Outlet, NavLink } from "react-router-dom";
import { FileVideo, CreditCard, User } from "lucide-react";

const navItems = [
  { to: "/account/properties", label: "Listings", icon: FileVideo },
  { to: "/account/billing", label: "Billing", icon: CreditCard },
  { to: "/account/profile", label: "Brand", icon: User },
];

export default function Account() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border">
        <div className="mx-auto flex max-w-[1280px] items-end justify-between gap-6 px-8 pb-6 pt-12 md:px-12">
          <div>
            <span className="label text-muted-foreground">— Account</span>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.02em] md:text-4xl">Your studio</h1>
          </div>
        </div>
        <nav className="mx-auto flex max-w-[1280px] items-center gap-8 px-8 md:px-12">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `relative flex items-center gap-2 py-4 text-[11px] font-medium uppercase tracking-[0.18em] transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
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

      <main className="mx-auto max-w-[1280px] px-8 py-16 md:px-12 md:py-20">
        <Outlet />
      </main>
    </div>
  );
}
