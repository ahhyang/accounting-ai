import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import { categoryToSourceType, MONTHLY_CHECKLIST } from "@/lib/portal/checklist";
import type { DocumentCategory } from "@prisma/client";
import { writeAuditEvent } from "@/lib/audit/log";

/** Soft ceiling only when falling back to data-URL storage (no Blob token). */
const DATA_URL_MAX_BYTES = 8 * 1024 * 1024; // 8 MB

export async function ensureMonthChecklist(companyId: string, periodId: string) {
  const existing = await db.documentRequest.count({ where: { companyId, periodId } });
  if (existing > 0) {
    return db.documentRequest.findMany({
      where: { companyId, periodId },
      include: { sourceDocument: true },
      orderBy: { sortOrder: "asc" }
    });
  }

  await db.documentRequest.createMany({
    data: MONTHLY_CHECKLIST.map((item) => ({
      companyId,
      periodId,
      key: item.key,
      title: item.title,
      instructions: item.instructions,
      whyItMatters: item.whyItMatters,
      category: item.category,
      sortOrder: item.sortOrder
    }))
  });

  return db.documentRequest.findMany({
    where: { companyId, periodId },
    include: { sourceDocument: true },
    orderBy: { sortOrder: "asc" }
  });
}

export async function storeUploadFile(file: File): Promise<{ fileUrl: string; storageKey: string }> {
  const key = `uploads/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const contentType = file.type || "application/octet-stream";

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    // Stream any type/size to Vercel Blob (no MIME filter)
    const blob = await put(key, file, {
      access: "public",
      contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN
    });
    return { fileUrl: blob.url, storageKey: blob.pathname };
  }

  if (file.size > DATA_URL_MAX_BYTES) {
    throw new Error(
      `File "${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)} MB. ` +
        `Without BLOB_READ_WRITE_TOKEN, max is ${DATA_URL_MAX_BYTES / (1024 * 1024)} MB. ` +
        `Add a Vercel Blob token for large / any-size uploads.`
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const base64 = bytes.toString("base64");
  return {
    fileUrl: `data:${contentType};base64,${base64}`,
    storageKey: key
  };
}

export async function createUploadedDocument(input: {
  companyId: string;
  periodId: string;
  category: DocumentCategory;
  file: File;
  uploadedByUserId: string;
  requestId?: string;
  clientNote?: string;
}) {
  const stored = await storeUploadFile(input.file);

  const doc = await db.sourceDocument.create({
    data: {
      companyId: input.companyId,
      periodId: input.periodId,
      category: input.category,
      type: categoryToSourceType(input.category),
      status: "UPLOADED",
      fileName: input.file.name,
      fileUrl: stored.fileUrl,
      storageKey: stored.storageKey,
      mimeType: input.file.type || "application/octet-stream",
      uploadedByUserId: input.uploadedByUserId,
      clientNote: input.clientNote
    }
  });

  if (input.requestId) {
    await db.documentRequest.update({
      where: { id: input.requestId },
      data: {
        status: "UPLOADED",
        sourceDocumentId: doc.id
      }
    });
  }

  await writeAuditEvent({
    companyId: input.companyId,
    actorUserId: input.uploadedByUserId,
    entityType: "SourceDocument",
    entityId: doc.id,
    action: "UPLOAD",
    afterJson: {
      fileName: input.file.name,
      mimeType: input.file.type || "application/octet-stream",
      sizeBytes: input.file.size,
      category: input.category,
      periodId: input.periodId
    }
  });

  return doc;
}

/** After bulk upload + AI classify, mark matching monthly checklist rows as received. */
export async function syncChecklistFromCategories(
  companyId: string,
  periodId: string,
  categories: DocumentCategory[]
) {
  const unique = Array.from(new Set(categories)).filter((c) => c !== "OTHER");
  if (unique.length === 0) return;

  await db.documentRequest.updateMany({
    where: {
      companyId,
      periodId,
      category: { in: unique },
      status: { in: ["NOT_STARTED", "NEEDS_FIX"] }
    },
    data: { status: "UPLOADED" }
  });
}
