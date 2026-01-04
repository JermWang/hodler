import { NextResponse } from "next/server";

import { isAdminRequestAsync } from "../../../../../../lib/adminAuth";
import { verifyAdminOrigin } from "../../../../../../lib/adminSession";
import { auditLog } from "../../../../../../lib/auditLog";
import { checkRateLimit } from "../../../../../../lib/rateLimit";
import { getCommitment, publicView, RewardMilestone, updateRewardTotalsAndMilestones } from "../../../../../../lib/escrowStore";
import { getSafeErrorMessage } from "../../../../../../lib/safeError";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: { id: string; milestoneId: string } }) {
  const rl = await checkRateLimit(req, { keyPrefix: "milestone:override", limit: 30, windowSeconds: 60 });
  if (!rl.allowed) {
    const res = NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    res.headers.set("retry-after", String(rl.retryAfterSeconds));
    return res;
  }

  verifyAdminOrigin(req);
  if (!(await isAdminRequestAsync(req))) {
    await auditLog("admin_reward_milestone_override_denied", { commitmentId: ctx.params.id, milestoneId: ctx.params.milestoneId });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = ctx.params.id;
  const milestoneId = ctx.params.milestoneId;
  const body = (await req.json().catch(() => null)) as any;

  try {
    const record = await getCommitment(id);
    if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (record.kind !== "creator_reward") {
      return NextResponse.json({ error: "Not a reward commitment" }, { status: 400 });
    }

    const milestones: RewardMilestone[] = Array.isArray(record.milestones) ? (record.milestones.slice() as RewardMilestone[]) : [];
    const idx = milestones.findIndex((m) => m.id === milestoneId);
    if (idx < 0) return NextResponse.json({ error: "Milestone not found" }, { status: 404 });

    const existing = milestones[idx];

    const rawTitle = typeof body?.title === "string" ? body.title.trim() : undefined;
    const rawDueAtUnix = body?.dueAtUnix != null ? Number(body.dueAtUnix) : undefined;
    const rawUnlockPercent = body?.unlockPercent != null ? Number(body.unlockPercent) : undefined;

    if (rawTitle == null && rawDueAtUnix == null && rawUnlockPercent == null) {
      return NextResponse.json({ error: "No fields provided" }, { status: 400 });
    }

    let title = existing.title;
    if (rawTitle != null) {
      if (!rawTitle) return NextResponse.json({ error: "title required" }, { status: 400 });
      if (rawTitle.length > 80) return NextResponse.json({ error: "title too long (max 80 chars)" }, { status: 400 });
      title = rawTitle;
    }

    let dueAtUnix = existing.dueAtUnix;
    if (rawDueAtUnix != null) {
      if (!Number.isFinite(rawDueAtUnix) || rawDueAtUnix <= 0) {
        return NextResponse.json({ error: "Invalid dueAtUnix" }, { status: 400 });
      }
      const nowUnix = Math.floor(Date.now() / 1000);
      const maxFutureSeconds = 10 * 365 * 24 * 60 * 60;
      if (rawDueAtUnix > nowUnix + maxFutureSeconds) {
        return NextResponse.json({ error: "dueAtUnix too far in the future" }, { status: 400 });
      }
      dueAtUnix = Math.floor(rawDueAtUnix);
    }

    let unlockPercent = existing.unlockPercent;
    if (rawUnlockPercent != null) {
      if (existing.completedAtUnix != null) {
        return NextResponse.json({ error: "Cannot edit unlockPercent after completion" }, { status: 409 });
      }
      if (!Number.isFinite(rawUnlockPercent) || rawUnlockPercent <= 0 || rawUnlockPercent > 100) {
        return NextResponse.json({ error: "unlockPercent must be between 1 and 100" }, { status: 400 });
      }
      unlockPercent = Math.floor(rawUnlockPercent);
    }

    milestones[idx] = {
      ...existing,
      title,
      dueAtUnix,
      unlockPercent,
    };

    const updated = await updateRewardTotalsAndMilestones({ id, milestones });

    await auditLog("admin_reward_milestone_override_ok", {
      commitmentId: id,
      milestoneId,
      fields: {
        title: rawTitle != null ? true : false,
        dueAtUnix: rawDueAtUnix != null ? true : false,
        unlockPercent: rawUnlockPercent != null ? true : false,
      },
    });

    return NextResponse.json({ ok: true, commitment: publicView(updated) });
  } catch (e) {
    await auditLog("admin_reward_milestone_override_error", { commitmentId: id, milestoneId, error: getSafeErrorMessage(e) });
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}
