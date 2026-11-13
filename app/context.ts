import { createContext } from "react-router";
import type { SessionUser } from "~/lib/types";

/** The signed-in user (any role), or null. Set by the root middleware. */
export const userContext = createContext<SessionUser | null>(null);

/** A signed-in member or admin. Set by the members-layout middleware. */
export const memberContext = createContext<SessionUser>();
