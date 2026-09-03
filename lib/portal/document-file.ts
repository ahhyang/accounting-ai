import { db } from "@/lib/db";

export type ResolvedFile = {
  dataUrl: string;
  mimeType: string;
  fileName: string;
};

const IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif"
]);

export function isImageMime(mime: string | null | undefined) {
  if (!mime) return false;
  return IMAGE_MIMES.has(mime.toLowerCase()) || mime.startsWith("image/");
}

export function isPdfMime(mime: string | null | undefined) {
  return mime?.toLowerCase() === "application/pdf";
}

export function isScannableMime(mime: string | null | undefined) {
  return isImageMime(mime) || isPdfMime(mime);
}

export async function resolveDocumentFile(doc: {
  fileUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
  storageKey: string | null;
}): Promise<ResolvedFile | null> {
  const fileName = doc.fileName ?? "document";
  const mimeType = doc.mimeType ?? "application/octet-stream";

  if (doc.fileUrl?.startsWith("data:")) {
    return { dataUrl: doc.fileUrl, mimeType, fileName };
  }

  if (doc.fileUrl) {
    const res = await fetch(doc.fileUrl);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const resolvedMime = res.headers.get("content-type") ?? mimeType;
    const base64 = buffer.toString("base64");
    return {
      dataUrl: `data:${resolvedMime};base64,${base64}`,
      mimeType: resolvedMime,
      fileName
    };
  }

  return null;
}

export async function resolveDocumentFileById(documentId: string) {
  const doc = await db.sourceDocument.findUnique({ where: { id: documentId } });
  if (!doc) return null;
  const file = await resolveDocumentFile(doc);
  if (!file) return null;
  return { doc, file };
}

export async function fileToDataUrl(file: File): Promise<ResolvedFile> {
  const bytes = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";
  const base64 = bytes.toString("base64");
  return {
    dataUrl: `data:${mimeType};base64,${base64}`,
    mimeType,
    fileName: file.name
  };
}
