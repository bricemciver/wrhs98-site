import { env } from "cloudflare:workers";
import { Camera } from "lucide-react";
import { useId, useState } from "react";
import { data, Form, Link, useNavigation, useRevalidator } from "react-router";
import { z } from "zod";
import { Alert, Avatar, Button, Card, Checkbox, Field, Input, PageHeader, Textarea } from "~/components/ui";
import { memberContext } from "~/context";
import { classmateInitials, classmateName } from "~/lib/format";
import { bool, str } from "~/lib/http.server";
import { decodeImage, resizeBitmap } from "~/lib/image-client";
import { cleanLinks, MAX_LINKS, parseLinks, serializeLinks } from "~/lib/social";
import type { Route } from "./+types/profile";
import { pageTitle, SCHOOL } from "~/lib/school";

export const meta: Route.MetaFunction = () => [{ title: pageTitle("My profile") }];

interface ProfileRow {
  city: string | null;
  state: string | null;
  contact_email: string | null;
  phone: string | null;
  links: string | null;
  bio: string | null;
  photo_key: string | null;
  share_email: number;
  share_phone: number;
  share_location: number;
  share_links: number;
}

export async function loader({ context }: Route.LoaderArgs) {
  const user = context.get(memberContext);
  const [profile, classmate] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM profiles WHERE user_id = ?").bind(user.id),
    env.DB.prepare("SELECT id, first_name, last_name, nickname, current_last_name FROM classmates WHERE id = ?").bind(
      user.classmateId ?? 0,
    ),
  ]);
  const c = classmate.results[0] as
    | { id: number; first_name: string; last_name: string; nickname: string | null; current_last_name: string | null }
    | undefined;
  return {
    email: user.email,
    name: user.name,
    classmate: c
      ? {
          id: c.id,
          name: classmateName(c),
          initials: classmateInitials(c),
          last_name: c.last_name,
          current_last_name: c.current_last_name,
        }
      : null,
    profile: (profile.results[0] as ProfileRow | undefined) ?? null,
    links: parseLinks((profile.results[0] as ProfileRow | undefined)?.links),
  };
}

const schema = z.object({
  name: z.string().min(1, "Please enter your name.").max(120),
  current_last_name: z.string().max(80),
  city: z.string().max(80),
  state: z.string().max(40),
  contact_email: z.union([z.literal(""), z.email("Enter a valid email address.").max(254)]),
  phone: z.string().max(40),
  bio: z.string().max(4000),
});

export async function action({ request, context }: Route.ActionArgs) {
  const user = context.get(memberContext);
  const form = await request.formData();
  const parsed = schema.safeParse({
    name: str(form, "name"),
    current_last_name: str(form, "current_last_name"),
    city: str(form, "city"),
    state: str(form, "state"),
    contact_email: str(form, "contact_email").toLowerCase(),
    phone: str(form, "phone"),
    bio: str(form, "bio"),
  });
  if (!parsed.success) {
    return data({ error: parsed.error.issues[0]?.message ?? "Please check the form." }, { status: 400 });
  }
  const p = parsed.data;
  const n = (s: string) => s || null;
  const linkResult = cleanLinks(form.getAll("links").map(String));
  if ("invalid" in linkResult) {
    return data({ error: `“${linkResult.invalid}” doesn't look like a web address.` }, { status: 400 });
  }
  const stmts = [
    env.DB.prepare("UPDATE users SET name = ? WHERE id = ?").bind(p.name, user.id),
    env.DB.prepare(
      `INSERT INTO profiles (user_id, city, state, contact_email, phone, links, bio,
                             share_email, share_phone, share_location, share_links, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
       ON CONFLICT (user_id) DO UPDATE SET city = excluded.city,
         state = excluded.state, contact_email = excluded.contact_email, phone = excluded.phone,
         links = excluded.links, bio = excluded.bio, share_email = excluded.share_email,
         share_phone = excluded.share_phone, share_location = excluded.share_location,
         share_links = excluded.share_links, updated_at = unixepoch()`,
    ).bind(
      user.id,
      n(p.city),
      n(p.state),
      n(p.contact_email),
      n(p.phone),
      serializeLinks(linkResult.links),
      n(p.bio),
      bool(form, "share_email"),
      bool(form, "share_phone"),
      bool(form, "share_location"),
      bool(form, "share_links"),
    ),
  ];
  // The current last name lives on the member's roster entry (shared with admins' edits).
  if (user.classmateId !== null) {
    stmts.push(
      env.DB.prepare("UPDATE classmates SET current_last_name = ?, updated_at = unixepoch() WHERE id = ?").bind(
        n(p.current_last_name),
        user.classmateId,
      ),
    );
  }
  await env.DB.batch(stmts);
  return { ok: true };
}

function PhotoPicker({ current, fallback, label }: { current: string | null; fallback: string; label: string }) {
  const id = useId();
  const revalidator = useRevalidator();
  const [status, setStatus] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus("Uploading…");
    try {
      const bitmap = await decodeImage(file);
      const { blob } = await resizeBitmap(bitmap, 800, 0.85);
      bitmap.close();
      const body = new FormData();
      body.set("target", "profile");
      body.set("photo", new File([blob], "profile.jpg", { type: "image/jpeg" }));
      const res = await fetch("/api/profile-photo", { method: "POST", body });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? "Upload failed");
      setPreview(json.url);
      setStatus("Photo updated.");
      revalidator.revalidate();
    } catch (err) {
      setStatus(err instanceof Error && err.message !== "Upload failed" ? err.message : "Couldn't use that photo. Try a JPEG or PNG.");
    }
    e.target.value = "";
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar size="lg" src={preview ?? current} initials={fallback} alt={label} />
      <div className="flex flex-col gap-2">
        <label htmlFor={id} className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-card px-3 text-sm font-medium hover:bg-muted cursor-pointer">
          <Camera className="size-4" aria-hidden="true" />
          {current || preview ? "Change photo" : "Add a photo"}
        </label>
        <input id={id} type="file" accept="image/*" className="sr-only" onChange={onChange} />
        {status && (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {status}
          </p>
        )}
      </div>
    </div>
  );
}

export default function Profile({ loaderData, actionData }: Route.ComponentProps) {
  const { email, name, classmate, profile } = loaderData;
  const busy = useNavigation().state === "submitting";
  const p = profile;

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader
        title="My profile"
        description={
          classmate ? (
            <>
              You&apos;re listed in the directory as <Link to={`/directory/${classmate.id}`} className="text-primary underline">{classmate.name}</Link>.
              You choose what other classmates can see.
            </>
          ) : (
            "Your account isn't linked to a roster entry, so you won't appear in the class directory."
          )
        }
      />
      <Card className="p-6 flex flex-col gap-6">
        <PhotoPicker current={p?.photo_key ? `/files/${p.photo_key}` : null} fallback={classmate?.initials ?? "?"} label="Your profile photo" />

        {actionData && "ok" in actionData && <Alert tone="success">Profile saved.</Alert>}
        {actionData && "error" in actionData && <Alert tone="error">{actionData.error}</Alert>}

        <Form method="post" className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Your name" htmlFor="name">
              <Input id="name" name="name" required maxLength={120} defaultValue={name ?? ""} autoComplete="name" />
            </Field>
            {classmate && (
              <Field
                label="Current last name"
                htmlFor="current_last_name"
                hint={`Only if it's changed since ${SCHOOL.classYear}. Classmates will see “${classmate.last_name}” in parentheses so they can still find you. We may have filled this in from your Google or Microsoft account; fix it here if it's wrong.`}
              >
                <Input id="current_last_name" name="current_last_name" maxLength={80} defaultValue={classmate.current_last_name ?? ""} />
              </Field>
            )}
            <Field label="City" htmlFor="city">
              <Input id="city" name="city" maxLength={80} defaultValue={p?.city ?? ""} autoComplete="address-level2" />
            </Field>
            <Field label="State" htmlFor="state">
              <Input id="state" name="state" maxLength={40} defaultValue={p?.state ?? ""} autoComplete="address-level1" />
            </Field>
            <Field label="Contact email" htmlFor="contact_email" hint={`Leave blank to use ${email}.`}>
              <Input id="contact_email" name="contact_email" type="email" maxLength={254} defaultValue={p?.contact_email ?? ""} />
            </Field>
            <Field label="Phone" htmlFor="phone">
              <Input id="phone" name="phone" type="tel" maxLength={40} defaultValue={p?.phone ?? ""} autoComplete="tel" />
            </Field>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium mb-1.5">Social media and websites</legend>
            <p className="text-sm text-muted-foreground -mt-1">
              Paste links to your Facebook, Instagram, LinkedIn, or any other profile or site (up to {MAX_LINKS}).
            </p>
            {Array.from({ length: MAX_LINKS }, (_, i) => (
              <div key={i}>
                <label htmlFor={`link-${i}`} className="sr-only">
                  Link {i + 1}
                </label>
                <Input
                  id={`link-${i}`}
                  name="links"
                  type="text"
                  inputMode="url"
                  maxLength={300}
                  placeholder={i === 0 ? "facebook.com/yourname" : "https://"}
                  defaultValue={loaderData.links[i] ?? ""}
                />
              </div>
            ))}
          </fieldset>
          <Field label={`What have you been up to since ${SCHOOL.classYear}?`} htmlFor="bio" hint="Family, work, where life has taken you, favorite high school memory…">
            <Textarea id="bio" name="bio" maxLength={4000} rows={6} defaultValue={p?.bio ?? ""} />
          </Field>

          <fieldset className="flex flex-col gap-2 rounded-md border p-4">
            <legend className="px-1 text-sm font-medium">Show to other classmates</legend>
            <Checkbox name="share_location" defaultChecked={p ? p.share_location === 1 : true} label="My city and state" />
            <Checkbox name="share_email" defaultChecked={p ? p.share_email === 1 : true} label="My contact email" />
            <Checkbox name="share_phone" defaultChecked={p ? p.share_phone === 1 : false} label="My phone number" />
            <Checkbox name="share_links" defaultChecked={p ? p.share_links === 1 : true} label="My social media and website links" />
            <p className="text-sm text-muted-foreground">Class admins can always see your contact info so they can reach you about the reunion.</p>
          </fieldset>

          <div>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save profile"}
            </Button>
          </div>
        </Form>
      </Card>
      <p className="mt-6 text-sm text-muted-foreground">
        Want to leave the site?{" "}
        <Link to="/account/delete" className="text-primary underline">
          Delete my account
        </Link>
      </p>
    </div>
  );
}
