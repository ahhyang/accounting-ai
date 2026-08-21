import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export async function writeAuditEvent(input: {
  companyId: string;
  actorUserId?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  beforeJson?: Prisma.InputJsonValue;
  afterJson?: Prisma.InputJsonValue;
  reason?: string;
  ipAddress?: string;
}) {
  return db.auditEvent.create({
    data: {
      companyId: input.companyId,
      actorUserId: input.actorUserId ?? undefined,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      beforeJson: input.beforeJson,
      afterJson: input.afterJson,
      reason: input.reason,
      ipAddress: input.ipAddress
    }
  });
}
