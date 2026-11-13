import { ChevronLeft, ChevronRight, Download, EyeOff, Eye, Trash2, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import { formatDate } from "~/lib/format";
import { Badge, Button, buttonClass } from "./ui";

export interface LightboxItem {
  id: number;
  kind: "photo" | "video";
  content_type: string;
  caption: string | null;
  has_display: number;
  has_thumb: number;
  status: "ready" | "hidden" | "uploading";
  uploader_id: number | null;
  uploader_name: string | null;
  created_at: number;
}

interface Props {
  items: LightboxItem[];
  index: number;
  viewerId: number;
  isAdmin: boolean;
  onNavigate: (index: number | null) => void;
}

export function Lightbox({ items, index, viewerId, isAdmin, onNavigate }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fetcher = useFetcher();
  const item = items[index];
  const canManage = item && (item.uploader_id === viewerId || isAdmin);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (dlg && !dlg.open) dlg.showModal();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" && index < items.length - 1) onNavigate(index + 1);
      if (e.key === "ArrowLeft" && index > 0) onNavigate(index - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, items.length, onNavigate]);

  if (!item) return null;
  const src = item.kind === "photo" ? `/media/${item.id}/${item.has_display ? "display" : "original"}` : `/media/${item.id}/original`;

  return (
    <dialog
      ref={dialogRef}
      aria-label={item.caption ?? (item.kind === "video" ? "Video" : "Photo")}
      onClose={() => onNavigate(null)}
      onClick={(e) => e.target === e.currentTarget && dialogRef.current?.close()}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-black/90 p-0 text-white backdrop:bg-black/80"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-2 p-3">
          <span className="text-sm text-white/70">
            {index + 1} / {items.length}
          </span>
          <div className="flex items-center gap-1">
            <a href={`/media/${item.id}/original?download`} className={buttonClass("ghost", "sm", "text-white hover:bg-white/10")}>
              <Download className="size-4" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">Download</span>
            </a>
            {isAdmin && (
              <fetcher.Form method="post" action={`/api/media/${item.id}`}>
                <input type="hidden" name="intent" value={item.status === "hidden" ? "unhide" : "hide"} />
                <Button variant="ghost" size="sm" className="text-white hover:bg-white/10">
                  {item.status === "hidden" ? <Eye className="size-4" aria-hidden="true" /> : <EyeOff className="size-4" aria-hidden="true" />}
                  <span className="sr-only sm:not-sr-only">{item.status === "hidden" ? "Unhide" : "Hide"}</span>
                </Button>
              </fetcher.Form>
            )}
            {canManage && (
              <fetcher.Form
                method="post"
                action={`/api/media/${item.id}`}
                onSubmit={(e) => {
                  if (!confirm("Delete this permanently?")) e.preventDefault();
                  else onNavigate(items.length > 1 ? Math.max(0, index - 1) : null);
                }}
              >
                <input type="hidden" name="intent" value="delete" />
                <Button variant="ghost" size="sm" className="text-white hover:bg-white/10">
                  <Trash2 className="size-4" aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only">Delete</span>
                </Button>
              </fetcher.Form>
            )}
            <Button variant="ghost" size="sm" className="text-white hover:bg-white/10" onClick={() => dialogRef.current?.close()}>
              <X className="size-5" aria-hidden="true" />
              <span className="sr-only">Close</span>
            </Button>
          </div>
        </div>

        <div className="relative flex flex-1 items-center justify-center min-h-0 px-2">
          {item.kind === "photo" ? (
            <img key={item.id} src={src} alt={item.caption ?? "Photo"} className="max-h-full max-w-full object-contain" />
          ) : (
            <video
              key={item.id}
              src={src}
              poster={item.has_thumb ? `/media/${item.id}/thumb` : undefined}
              controls
              playsInline
              preload="metadata"
              className="max-h-full max-w-full"
            >
              <track kind="captions" />
            </video>
          )}
          {index > 0 && (
            <button
              type="button"
              onClick={() => onNavigate(index - 1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 hover:bg-black/70"
            >
              <ChevronLeft className="size-6" aria-hidden="true" />
              <span className="sr-only">Previous</span>
            </button>
          )}
          {index < items.length - 1 && (
            <button
              type="button"
              onClick={() => onNavigate(index + 1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 hover:bg-black/70"
            >
              <ChevronRight className="size-6" aria-hidden="true" />
              <span className="sr-only">Next</span>
            </button>
          )}
        </div>

        <div className="flex flex-col gap-1 p-4 text-sm max-w-3xl mx-auto w-full">
          {item.status === "hidden" && (
            <p>
              <Badge tone="destructive">Hidden from members</Badge>
            </p>
          )}
          {item.caption && <p className="text-base">{item.caption}</p>}
          <p className="text-white/60">
            {item.uploader_name ? `Shared by ${item.uploader_name}` : "Shared"} on {formatDate(item.created_at)}
          </p>
        </div>
      </div>
    </dialog>
  );
}
