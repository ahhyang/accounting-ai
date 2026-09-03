import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import { categoryToSourceType, MONTHLY_CHECKLIST } from "@/lib/portal/checklist";
import type { DocumentCategory } from "@prisma/client";
import { writeAuditEvent } from "@/lib/audit/log";

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
  const bytes = Buffer.from(await file.arrayBuffer());
  const key = `uploads/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(key, bytes, {
      access: "public",
      contentType: file.type || "application/octet-stream",
      token: process.env.BLOB_READ_WRITE_TOKEN
    });
    return { fileUrl: blob.url, storageKey: blob.pathname };
  }

  // Demo fallback: data URL (fine for small receipts in MVP)
  const base64 = bytes.toString("base64");
  const mime = file.type || "application/octet-stream";
  return {
    fileUrl: `data:${mime};base64,${base64}`,
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
      mimeType: input.file.type || null,
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
      category: input.category,
      periodId: input.periodId
    }
  });

  return doc;
}
