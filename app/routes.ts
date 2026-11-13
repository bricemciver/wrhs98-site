import { type RouteConfig, index, layout, prefix, route } from "@react-router/dev/routes";

export default [
  // Public (signed-out) pages
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.tsx"),
  route("auth/email", "routes/auth.email.tsx"),
  route("auth/verify", "routes/auth.verify.tsx"),
  route("auth/:provider", "routes/auth.provider.tsx"),
  route("auth/:provider/callback", "routes/auth.provider.callback.tsx"),
  route("pending", "routes/pending.tsx"),
  route("preview", "routes/preview.tsx"),
  route("account/delete", "routes/account.delete.tsx"),

  // Members only (members-layout middleware enforces access)
  layout("routes/members-layout.tsx", [
    route("news", "routes/news.tsx"),
    route("news/:slug", "routes/news.post.tsx"),
    route("photos", "routes/photos.tsx"),
    route("photos/:slug", "routes/photos.album.tsx"),
    route("directory", "routes/directory.tsx"),
    route("directory/:id", "routes/directory.classmate.tsx"),
    route("profile", "routes/profile.tsx"),
    route("find", "routes/find.tsx"),
    route("in-memoriam", "routes/in-memoriam.tsx"),

    // Resource routes: media files and upload API
    route("media/:id/:variant", "routes/media.file.ts"),
    route("files/*", "routes/files.ts"),
    route("api/media", "routes/api/media.create.ts"),
    route("api/media/:id", "routes/api/media.item.ts"),
    route("api/media/:id/:variant", "routes/api/media.upload.ts"),
    route("api/profile-photo", "routes/api/profile-photo.ts"),

    ...prefix("admin", [
      layout("routes/admin/layout.tsx", [
        index("routes/admin/index.tsx"),
        route("requests", "routes/admin/requests.tsx"),
        route("roster", "routes/admin/roster.tsx"),
        route("roster/new", "routes/admin/roster.edit.tsx", { id: "roster-new" }),
        route("roster/import", "routes/admin/roster.import.tsx"),
        route("roster/:id", "routes/admin/roster.edit.tsx", { id: "roster-edit" }),
        route("members", "routes/admin/members.tsx"),
        route("news", "routes/admin/news.tsx"),
        route("news/new", "routes/admin/news.edit.tsx", { id: "news-new" }),
        route("news/:id", "routes/admin/news.edit.tsx", { id: "news-edit" }),
        route("albums", "routes/admin/albums.tsx"),
        route("leads", "routes/admin/leads.tsx"),
        route("suggestions", "routes/admin/suggestions.tsx"),
        route("activity", "routes/admin/activity.tsx"),
      ]),
    ]),
  ]),
] satisfies RouteConfig;
