import { env } from "cloudflare:workers";
import type { ActivityGroup } from "./activity";
import type { SessionUser } from "./types";

export interface ActivityTarget {
  type: "user" | "classmate" | "post" | "album" | "media" | "lead" | "suggestion" | "request";
  id: number | null;
}

type Actor = Pick<SessionUser, "id" | "name" | "email">;

/**
 * A statement that records one admin action, for adding to the same
 * env.DB.batch as the change itself. Summaries name people and say which
 * fields changed; never put contact details or notes in them.
 */
export function activityStmt(actor: Actor, action: `${ActivityGroup}.${string}`, summary: string, target?: ActivityTarget) {
  return env.DB.prepare(
    "INSERT INTO audit_log (actor_id, actor_label, action, target_type, target_id, summary) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(actor.id, actor.name?.trim() || actor.email, action, target?.type ?? null, target?.id ?? null, summary.slice(0, 1000));
}

export async function logActivity(...args: Parameters<typeof activityStmt>): Promise<void> {
  await activityStmt(...args).run();
}
