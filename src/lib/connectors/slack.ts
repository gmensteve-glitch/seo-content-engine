// Slack notifications via an incoming webhook. Used to forward SEO
// recommendations to a channel so they're seen in real time (not just in the
// in-app inbox). The webhook URL is stored per business in the Connector table
// (entered in the Connectors page) or falls back to a SLACK_WEBHOOK_URL env var.
// Every call is best-effort — a Slack failure never blocks the app action.

import { prisma } from "@/lib/db";
import { decryptJson } from "@/lib/crypto/secrets";
import { encryptionEnabled } from "@/lib/env";

/** Resolve the incoming-webhook URL for a business (DB connector wins over env). */
export async function getSlackWebhook(businessId: string): Promise<string | null> {
  if (encryptionEnabled()) {
    const row = await prisma.connector
      .findUnique({ where: { businessId_type: { businessId, type: "SLACK" } } })
      .catch(() => null);
    if (row && row.status === "CONNECTED") {
      try {
        const cfg = decryptJson(row.configEnc) as { webhookUrl?: string };
        if (cfg.webhookUrl) return cfg.webhookUrl;
      } catch {
        /* fall through to env */
      }
    }
  }
  return process.env.SLACK_WEBHOOK_URL || null;
}

export interface RecommendationNotice {
  note: string;
  author?: string | null;
  businessName?: string | null;
  hasImage?: boolean;
}

/** Post an SEO recommendation to Slack. No-op (returns false) when unconfigured. */
export async function postRecommendationToSlack(
  businessId: string,
  rec: RecommendationNotice,
): Promise<boolean> {
  const webhook = await getSlackWebhook(businessId);
  if (!webhook) return false;

  const who = rec.author?.trim() ? `*${rec.author.trim()}*` : "Someone";
  const biz = rec.businessName ? ` · ${rec.businessName}` : "";
  const shot = rec.hasImage ? "\n📎 _Screenshot attached — view it in the SEO inbox._" : "";
  const text = `🔎 *New SEO recommendation*${biz}\n${who} wrote:\n>>> ${rec.note}${shot}`;

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    return res.ok;
  } catch (e) {
    console.error("[slack] post failed:", e instanceof Error ? e.message : e);
    return false;
  }
}
