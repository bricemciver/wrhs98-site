/**
 * Browser-only helpers that make resized copies of photos and poster frames
 * for videos before upload, so the server never has to process images.
 */

export interface Resized {
  blob: Blob;
  width: number;
  height: number;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode image"))), type, quality),
  );
}

function draw(source: CanvasImageSource, sw: number, sh: number, maxDim: number) {
  const scale = Math.min(1, maxDim / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, w, h);
  return canvas;
}

/** Decodes an image (respecting EXIF orientation). Throws if the browser can't decode it (e.g. HEIC on Chrome). */
export async function decodeImage(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

export async function resizeBitmap(bitmap: ImageBitmap, maxDim: number, quality = 0.85): Promise<Resized> {
  const canvas = draw(bitmap, bitmap.width, bitmap.height, maxDim);
  const blob = await canvasToBlob(canvas, "image/jpeg", quality);
  return { blob, width: canvas.width, height: canvas.height };
}

/** Grabs a frame ~1s in (or the middle of very short clips). Returns null if the browser can't play the format. */
export async function videoPoster(file: File, maxDim = 640): Promise<(Resized & { duration: number }) | null> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("unsupported"));
      setTimeout(() => reject(new Error("timeout")), 15000);
    });
    const duration = video.duration;
    video.currentTime = Number.isFinite(duration) ? Math.min(1, duration / 2) : 0;
    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      setTimeout(() => reject(new Error("timeout")), 15000);
    });
    const canvas = draw(video, video.videoWidth, video.videoHeight, maxDim);
    const blob = await canvasToBlob(canvas, "image/jpeg", 0.8);
    return { blob, width: video.videoWidth, height: video.videoHeight, duration };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Normalizes MIME types browsers report inconsistently (e.g. empty for HEIC). */
export function guessType(file: File): string {
  if (file.type) return file.type === "image/jpg" ? "image/jpeg" : file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    heic: "image/heic",
    heif: "image/heif",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    mov: "video/quicktime",
    mp4: "video/mp4",
    m4v: "video/mp4",
    webm: "video/webm",
  };
  return (ext && map[ext]) || "application/octet-stream";
}
