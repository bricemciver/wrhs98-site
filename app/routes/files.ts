import { serveObject } from "~/lib/media.server";
import type { Route } from "./+types/files";

// Profile and memorial photos. Keys are random, and only members reach this route.
const ALLOWED = /^(profiles|memoriam)\/[A-Za-z0-9_-]+\.(jpg|webp)$/;

export async function loader({ request, params }: Route.LoaderArgs) {
  const key = params["*"] ?? "";
  if (!ALLOWED.test(key)) return new Response("Not found", { status: 404 });
  return serveObject(request, key);
}
