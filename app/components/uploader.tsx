import { CheckCircle2, CircleAlert, Loader2, Upload } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useRevalidator } from "react-router";
import { decodeImage, guessType, resizeBitmap, videoPoster } from "~/lib/image-client";
import { formatBytes } from "~/lib/format";
import { Button, Card, Field, Input } from "./ui";
import { SCHOOL } from "~/lib/school";

const MAX_PHOTO = 30 * 1024 * 1024;
const MAX_VIDEO = 95 * 1024 * 1024;

type Status = "waiting" | "processing" | "uploading" | "done" | "error";
interface Item {
  key: string;
  file: File;
  status: Status;
  progress: number;
  error?: string;
}

function putWithProgress(url: string, body: Blob, contentType: string, onProgress: (f: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(parseError(xhr.responseText) ?? `Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(body);
  });
}

function parseError(text: string): string | undefined {
  try {
    return JSON.parse(text).error;
  } catch {
    return undefined;
  }
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as { error?: string; id?: number };
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

async function uploadOne(file: File, albumId: number, caption: string, onStatus: (s: Status, p?: number) => void) {
  const contentType = guessType(file);
  const isVideo = contentType.startsWith("video/");
  if (!isVideo && !contentType.startsWith("image/")) throw new Error("Not a photo or video");
  if (file.size > (isVideo ? MAX_VIDEO : MAX_PHOTO)) {
    throw new Error(`Too large (${formatBytes(file.size)}). Limit is ${isVideo ? "95" : "30"} MB.`);
  }

  onStatus("processing");
  let width: number | undefined;
  let height: number | undefined;
  let display: Blob | undefined;
  let thumb: Blob | undefined;

  if (isVideo) {
    const poster = await videoPoster(file);
    if (poster) {
      thumb = poster.blob;
      width = poster.width;
      height = poster.height;
    }
  } else {
    let bitmap: ImageBitmap;
    try {
      bitmap = await decodeImage(file);
    } catch {
      throw new Error("This browser can't read that photo format. Try exporting it as JPEG first.");
    }
    width = bitmap.width;
    height = bitmap.height;
    display = (await resizeBitmap(bitmap, 2048, 0.86)).blob;
    thumb = (await resizeBitmap(bitmap, 600, 0.8)).blob;
    bitmap.close();
  }

  const { id } = await postJson("/api/media", {
    albumId,
    kind: isVideo ? "video" : "photo",
    contentType,
    originalName: file.name.slice(0, 200),
    caption: caption || undefined,
    width,
    height,
    size: file.size,
  });

  onStatus("uploading", 0);
  const total = file.size + (display?.size ?? 0) + (thumb?.size ?? 0);
  let done = 0;
  const step = async (variant: string, blob: Blob, type: string) => {
    await putWithProgress(`/api/media/${id}/${variant}`, blob, type, (f) => onStatus("uploading", (done + f * blob.size) / total));
    done += blob.size;
  };
  if (thumb) await step("thumb", thumb, "image/jpeg");
  if (display) await step("display", display, "image/jpeg");
  await step("original", file, contentType);
  await postJson(`/api/media/${id}`, { intent: "complete" });
  onStatus("done", 1);
}

export function Uploader({ albumId }: { albumId: number }) {
  const inputId = useId();
  const captionId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const revalidator = useRevalidator();

  const update = (key: string, patch: Partial<Item>) =>
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  async function start() {
    const files = Array.from(inputRef.current?.files ?? []);
    if (files.length === 0) return;
    const queued: Item[] = files.map((file, i) => ({ key: `${Date.now()}-${i}`, file, status: "waiting", progress: 0 }));
    setItems(queued);
    setBusy(true);
    for (const it of queued) {
      try {
        await uploadOne(it.file, albumId, caption.trim(), (status, progress) =>
          update(it.key, { status, ...(progress !== undefined ? { progress } : {}) }),
        );
      } catch (e) {
        update(it.key, { status: "error", error: e instanceof Error ? e.message : "Upload failed" });
      }
    }
    setBusy(false);
    setCaption("");
    if (inputRef.current) inputRef.current.value = "";
    revalidator.revalidate();
  }

  return (
    <Card className="p-5 flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Add photos or videos</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Files" htmlFor={inputId} hint="Photos up to 30 MB, videos up to 95 MB (about 1–2 minutes of phone video).">
          <input
            id={inputId}
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,video/mp4,video/quicktime,video/webm,.heic,.heif"
            disabled={busy}
            className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium"
          />
        </Field>
        <Field label="Caption (optional, applies to this batch)" htmlFor={captionId}>
          <Input
            id={captionId}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={500}
            disabled={busy}
            placeholder={`e.g. Homecoming ${SCHOOL.classYear - 1}, left to right: …`}
          />
        </Field>
      </div>
      <div>
        <Button type="button" onClick={start} disabled={busy}>
          {busy ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <Upload className="size-5" aria-hidden="true" />}
          {busy ? "Uploading…" : "Upload"}
        </Button>
      </div>
      {items.length > 0 && (
        <ul className="flex flex-col gap-2 text-sm" aria-live="polite">
          {items.map((it) => (
            <li key={it.key} className="flex items-center gap-3">
              {it.status === "done" ? (
                <CheckCircle2 className="size-4 text-success shrink-0" aria-hidden="true" />
              ) : it.status === "error" ? (
                <CircleAlert className="size-4 text-destructive shrink-0" aria-hidden="true" />
              ) : (
                <Loader2 className="size-4 animate-spin text-muted-foreground shrink-0" aria-hidden="true" />
              )}
              <span className="truncate flex-1">{it.file.name}</span>
              <span className={it.status === "error" ? "text-destructive" : "text-muted-foreground"}>
                {it.status === "uploading"
                  ? `${Math.round(it.progress * 100)}%`
                  : it.status === "error"
                    ? it.error
                    : it.status === "processing"
                      ? "Preparing…"
                      : it.status === "done"
                        ? "Done"
                        : "Waiting"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
