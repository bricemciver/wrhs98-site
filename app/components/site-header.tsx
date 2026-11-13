import { Menu } from "lucide-react";
import { Form, Link, NavLink } from "react-router";
import type { Role } from "~/lib/types";
import { buttonClass, cn } from "./ui";

interface Props {
  siteName: string;
  user: { name: string | null; email: string; role: Role } | null;
}

const memberNav = [
  { to: "/news", label: "News" },
  { to: "/photos", label: "Photos" },
  { to: "/directory", label: "Directory" },
  { to: "/find", label: "Help Us Find" },
  { to: "/in-memoriam", label: "In Memoriam" },
];

export function SiteHeader({ siteName, user }: Props) {
  const isMember = user?.role === "member" || user?.role === "admin";
  const nav = [...(isMember ? memberNav : []), ...(user?.role === "admin" ? [{ to: "/admin", label: "Admin" }] : [])];

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "rounded-md px-3 py-2 text-sm font-medium transition-colors",
      isActive ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
    );

  return (
    <header className="border-b bg-card">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:p-2 focus:bg-card">
        Skip to content
      </a>
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2 font-serif text-lg font-bold text-primary">
          <span className="rounded-md bg-primary text-primary-foreground px-2 py-0.5 text-sm font-sans">&apos;98</span>
          <span className="hidden sm:inline">{siteName}</span>
        </Link>

        <nav aria-label="Main" className="hidden lg:flex items-center gap-1">
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              {isMember && (
                <Link to="/profile" className="hidden md:inline text-sm text-muted-foreground hover:text-foreground">
                  {user.name ?? user.email}
                </Link>
              )}
              <Form method="post" action="/logout">
                <button type="submit" className={buttonClass("ghost", "sm")}>
                  Sign out
                </button>
              </Form>
            </>
          ) : (
            <Link to="/login" className={buttonClass("primary", "sm")}>
              Sign in
            </Link>
          )}

          {nav.length > 0 && (
            <details className="relative lg:hidden">
              <summary className={cn(buttonClass("ghost", "sm"), "list-none [&::-webkit-details-marker]:hidden")}>
                <Menu className="size-5" aria-hidden="true" />
                <span className="sr-only">Menu</span>
              </summary>
              <nav
                aria-label="Mobile"
                className="absolute right-0 top-12 z-20 w-56 rounded-lg border bg-card p-2 shadow-lg flex flex-col gap-1"
              >
                {nav.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={linkClass}
                    onClick={(e) => e.currentTarget.closest("details")?.removeAttribute("open")}
                  >
                    {item.label}
                  </NavLink>
                ))}
                <NavLink
                  to="/profile"
                  className={linkClass}
                  onClick={(e) => e.currentTarget.closest("details")?.removeAttribute("open")}
                >
                  My profile
                </NavLink>
              </nav>
            </details>
          )}
        </div>
      </div>
    </header>
  );
}
