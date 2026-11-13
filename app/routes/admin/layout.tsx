import { data, NavLink, Outlet } from "react-router";
import { cn } from "~/components/ui";
import { memberContext } from "~/context";
import { forbidden } from "~/lib/http.server";
import type { Route } from "./+types/layout";

const requireAdmin: Route.MiddlewareFunction = async ({ context }) => {
  const user = context.get(memberContext);
  // The root loader doesn't run when this throws, so tell the error page about the preview directly.
  if (user.previewing) throw data({ message: "Admins only. You're previewing the site as a member.", previewing: true }, { status: 403 });
  if (user.role !== "admin") forbidden("Admins only.");
};

export const middleware: Route.MiddlewareFunction[] = [requireAdmin];

const nav = [
  { to: "/admin", label: "Overview", end: true },
  { to: "/admin/requests", label: "Access requests" },
  { to: "/admin/roster", label: "Roster" },
  { to: "/admin/members", label: "Members" },
  { to: "/admin/news", label: "News" },
  { to: "/admin/albums", label: "Albums" },
  { to: "/admin/suggestions", label: "Suggestions" },
  { to: "/admin/leads", label: "Tips" },
  { to: "/admin/activity", label: "Activity" },
];

export default function AdminLayout() {
  return (
    <div className="flex flex-col gap-8 lg:flex-row">
      <nav aria-label="Admin" className="lg:w-48 shrink-0">
        <ul className="flex gap-1 overflow-x-auto lg:flex-col">
          {nav.map((n) => (
            <li key={n.to}>
              <NavLink
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cn(
                    "block whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium",
                    isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )
                }
              >
                {n.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="flex-1 min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
