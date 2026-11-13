import { Outlet, redirect } from "react-router";
import { memberContext, userContext } from "~/context";
import { isMember } from "~/lib/types";
import type { Route } from "./+types/members-layout";

/** Every route under this layout requires an approved member (or admin). */
const requireMember: Route.MiddlewareFunction = async ({ request, context }) => {
  const user = context.get(userContext);
  if (!user) {
    const url = new URL(request.url);
    throw redirect(`/login?redirectTo=${encodeURIComponent(url.pathname + url.search)}`);
  }
  if (!isMember(user)) throw redirect("/pending");
  context.set(memberContext, user);
};

export const middleware: Route.MiddlewareFunction[] = [requireMember];

export default function MembersLayout() {
  return <Outlet />;
}
