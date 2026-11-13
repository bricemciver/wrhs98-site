import { env } from "cloudflare:workers";
import {
  data,
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
  useRouteLoaderData,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";
import { userContext } from "./context";
import { SiteHeader } from "./components/site-header";
import { buttonClass } from "./components/ui";
import { applyPreview } from "./lib/preview.server";
import { loadSession } from "./lib/session.server";
import { normalizeUrl } from "./lib/social";
import { COLORS, SCHOOL, SITE_NAME } from "./lib/school";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,600;8..60,700&display=swap",
  },
];

/**
 * Root middleware: rejects cross-site form/API submissions, loads the
 * session into context, and refreshes the session cookie when needed.
 */
const sessionMiddleware: Route.MiddlewareFunction = async ({ request, context }, next) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("Origin");
    const fetchSite = request.headers.get("Sec-Fetch-Site");
    const sameOrigin = origin ? origin === new URL(request.url).origin : fetchSite !== "cross-site";
    if (!sameOrigin) throw data("Cross-site request rejected", { status: 403 });
  }

  const { user, setCookie } = await loadSession(request);
  context.set(userContext, applyPreview(request, user));
  const response = await next();
  if (setCookie) response.headers.append("Set-Cookie", setCookie);
  return response;
};

export const middleware: Route.MiddlewareFunction[] = [sessionMiddleware];

export function loader({ context }: Route.LoaderArgs) {
  const user = context.get(userContext);
  return {
    siteName: SITE_NAME,
    facebookGroupUrl: normalizeUrl(env.CLASS_FACEBOOK_GROUP_URL ?? ""),
    user: user ? { name: user.name, email: user.email, role: user.role } : null,
    previewing: user?.previewing === true,
  };
}

/** Shown on every page, including error pages, while an admin previews the site as a member. */
function PreviewBanner() {
  const root = useRouteLoaderData<typeof loader>("root");
  const location = useLocation();
  if (!root?.previewing) return null;
  return (
    <div role="status" className="sticky top-0 z-50 bg-accent text-accent-foreground">
      <div className="max-w-6xl mx-auto px-4 py-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
        <p>
          <strong>Previewing as a member.</strong> Admin tools and admin-only info are hidden. Anything you do still uses your
          own account.
        </p>
        <form method="post" action="/preview">
          <input type="hidden" name="intent" value="stop" />
          <input type="hidden" name="redirectTo" value={location.pathname + location.search} />
          <button type="submit" className="font-semibold underline underline-offset-2 cursor-pointer">
            Exit preview
          </button>
        </form>
      </div>
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="bg-background">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content={COLORS.primary} />
        <Meta />
        <Links />
      </head>
      <body className="min-h-dvh flex flex-col">
        <PreviewBanner />
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <SiteHeader siteName={loaderData.siteName} user={loaderData.user} />
      <main id="main" className="flex-1 w-full max-w-6xl mx-auto px-4 py-8 md:py-12">
        <Outlet />
      </main>
      <footer className="border-t">
        <div className="max-w-6xl mx-auto px-4 py-6 text-sm text-muted-foreground flex flex-col gap-1 md:flex-row md:justify-between">
          <p>
            {loaderData.siteName}
            {loaderData.facebookGroupUrl && (
              <>
                {" · "}
                <a href={loaderData.facebookGroupUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
                  Class Facebook group
                </a>
              </>
            )}
          </p>
          <div className="flex flex-col gap-1 md:items-end">
            <p>
              {SCHOOL.name} · {SCHOOL.location} · Go {SCHOOL.mascot}!
            </p>
            <p>Private site for classmates. Please don&apos;t share photos or contact info outside the class.</p>
            <p>
              Run by classmates. Not affiliated with {SCHOOL.name} or {SCHOOL.district}.
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let details = "An unexpected error occurred. Please try again.";
  let stack: string | undefined;
  let previewing = false;

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      title = "Page not found";
      details = "We couldn't find that page.";
    } else if (error.status === 403) {
      title = "Not allowed";
      const body = error.data as unknown;
      if (body && typeof body === "object" && "previewing" in body && "message" in body) {
        previewing = true;
        details = String(body.message);
      } else {
        details = typeof body === "string" ? body : "You don't have access to this page.";
      }
    } else {
      details = error.statusText || details;
    }
  } else if (import.meta.env.DEV && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-16 flex flex-col gap-4">
      <h1 className="text-3xl font-semibold">{title}</h1>
      <p className="text-muted-foreground">{details}</p>
      <p>
        <Link to="/" className="text-primary underline underline-offset-2">
          Go to the home page
        </Link>
      </p>
      {previewing && (
        <form method="post" action="/preview">
          <input type="hidden" name="intent" value="stop" />
          <input type="hidden" name="redirectTo" value="/admin" />
          <button type="submit" className={buttonClass("primary", "sm")}>
            Exit preview and open Admin
          </button>
        </form>
      )}
      {stack && (
        <pre className="w-full p-4 overflow-x-auto text-xs bg-muted rounded-md">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
