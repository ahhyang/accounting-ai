import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function GET() {
  const auth = await requireSession();
  if (!auth.ok) return auth.error;

  const companyId = auth.session.user.companyId;
  const messages = await db.clientMessage.findMany({
    where: { companyId },
    include: { sender: true, sourceDocument: true },
    orderBy: { createdAt: "desc" },
    take: 100
  });

  return NextResponse.json({ ok: true, messages });
}

export async function POST(request: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.error;

  const body = await request.json();
  const message = await db.clientMessage.create({
    data: {
      companyId: auth.session.user.companyId,
      sourceDocumentId: body.sourceDocumentId || null,
      senderUserId: auth.session.user.id,
      body: String(body.body || ""),
      isFromAccountant: auth.session.user.isAccountant
    }
  });

  return NextResponse.json({ ok: true, message }, { status: 201 });
}
