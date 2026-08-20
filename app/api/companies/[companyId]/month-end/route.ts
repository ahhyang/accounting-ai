import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  calculateCompletionScore,
  getRemainingTasks
} from "@/lib/accounting/month-end";
import { getOrCreateMonthEndRun } from "@/lib/company/setup";

export async function GET(
  request: Request,
  { params }: { params: { companyId: string } }
) {
  const { searchParams } = new URL(request.url);
  const periodId = searchParams.get("periodId");

  let period;
  if (periodId) {
    period = await db.accountingPeriod.findFirst({
      where: { id: periodId, companyId: params.companyId }
    });
  } else {
    period = await db.accountingPeriod.findFirst({
      where: { companyId: params.companyId },
      orderBy: { startDate: "desc" }
    });
  }

  if (!period) {
    return NextResponse.json({ ok: false, error: "No accounting period found." }, { status: 404 });
  }

  const run = await getOrCreateMonthEndRun(params.companyId, period.id);
  const score = calculateCompletionScore(run.tasks);
  const remaining = getRemainingTasks(run.tasks);

  if (Number(run.completionScore) !== score) {
    await db.monthEndRun.update({
      where: { id: run.id },
      data: { completionScore: score }
    });
  }

  return NextResponse.json({
    ok: true,
    period,
    run: { ...run, completionScore: score },
    remainingCount: remaining.length,
    remainingTasks: remaining,
    summary: `Month-end is ${score}% complete. ${remaining.length} task(s) remain.`
  });
}

const updateSchema = z.object({
  taskId: z.string().min(1),
  status: z.enum(["PENDING", "COMPLETED", "SKIPPED", "NOT_APPLICABLE"]),
  completedBy: z.string().optional(),
  notes: z.string().optional()
});

export async function PATCH(
  request: Request,
  { params }: { params: { companyId: string } }
) {
  try {
    const json = await request.json();
    const payload = updateSchema.parse(json);

    const task = await db.monthEndTask.findFirst({
      where: {
        id: payload.taskId,
        run: { companyId: params.companyId }
      },
      include: { run: { include: { tasks: true } } }
    });

    if (!task) {
      return NextResponse.json({ ok: false, error: "Task not found." }, { status: 404 });
    }

    await db.monthEndTask.update({
      where: { id: payload.taskId },
      data: {
        status: payload.status,
        completedAt: payload.status === "COMPLETED" ? new Date() : null,
        completedBy: payload.completedBy,
        notes: payload.notes
      }
    });

    const updatedTasks = task.run.tasks.map((t) =>
      t.id === payload.taskId ? { ...t, status: payload.status } : t
    );
    const score = calculateCompletionScore(updatedTasks);
    const remaining = getRemainingTasks(updatedTasks);

    await db.monthEndRun.update({
      where: { id: task.runId },
      data: { completionScore: score }
    });

    return NextResponse.json({
      ok: true,
      completionScore: score,
      remainingCount: remaining.length,
      summary: `Month-end is ${score}% complete. ${remaining.length} task(s) remain.`
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: error.issues }, { status: 422 });
    }

    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
