import { createRequestHandler } from "react-router";
import { canonicalStatus, canonicalUrl } from "../app/lib/canonical";
import { sendOverdueReminders } from "../app/lib/reminders.server";

const REMINDER_CRON = "0 14 * * *";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

export default {
  async fetch(request, env) {
    // One official address (SITE_URL): an old domain or "www." redirects there.
    const canonical = canonicalUrl(request.url, env.SITE_URL);
    if (canonical) return Response.redirect(canonical, canonicalStatus(request.method));

    const response = await requestHandler(request);
    // Responses from the router can have immutable headers; copy to be safe.
    const res = new Response(response.body, response);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
      if (!res.headers.has(k)) res.headers.set(k, v);
    }
    // Only the landing page should ever appear in search engines.
    if (new URL(request.url).pathname !== "/") {
      res.headers.set("X-Robots-Tag", "noindex, nofollow");
    }
    return res;
  },

  async scheduled(controller, env) {
    if (controller.cron === REMINDER_CRON) {
      const result = await sendOverdueReminders();
      console.log("[reminders]", JSON.stringify(result));
      return;
    }
    const dayAgo = Math.floor(Date.now() / 1000) - 60 * 60 * 24;
    // Abandoned uploads: remove R2 objects, then the rows.
    const stale = await env.DB.prepare("SELECT id FROM media WHERE status = 'uploading' AND created_at < ?")
      .bind(dayAgo)
      .all<{ id: number }>();
    for (const { id } of stale.results) {
      await env.MEDIA.delete([`media/${id}/original`, `media/${id}/display`, `media/${id}/thumb`]);
      await env.DB.prepare("DELETE FROM media WHERE id = ?").bind(id).run();
    }
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE expires_at < unixepoch()"),
      env.DB.prepare("DELETE FROM magic_links WHERE expires_at < unixepoch() - 86400"),
    ]);
  },
} satisfies ExportedHandler<Env>;
