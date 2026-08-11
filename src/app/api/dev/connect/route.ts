// Dev-only connector save. Encrypts a connector config (CONNECTOR_ENCRYPTION_KEY)
// and upserts it for a business so the pipeline can use it (e.g. publishing via
// Shopify). This is the backend of the eventual "Connect" UI flow. Disabled in
// production unless ENABLE_DEV_ROUTES is set.

import { NextResponse } from "next/server";
import { prisma, hasDatabase } from "@/lib/db";
import { encryptJson } from "@/lib/crypto/secrets";
import type { ConnectorType } from "@prisma/client";

export const dynamic = "force-dynamic";

function disabled(): boolean {
  return process.env.NODE_ENV === "production" && !process.env.ENABLE_DEV_ROUTES;
}

export async function POST(req: Request): Promise<Response> {
  if (disabled()) return NextResponse.json({ error: "dev routes disabled" }, { status: 403 });
  if (!hasDatabase) return NextResponse.json({ error: "no DATABASE_URL" }, { status: 400 });

  const { businessId, type, config } = (await req.json().catch(() => ({}))) as {
    businessId?: string;
    type?: ConnectorType;
    config?: unknown;
  };
  if (!businessId || !type || !config) {
    return NextResponse.json({ error: "businessId, type, config required" }, { status: 400 });
  }

  const configEnc = encryptJson(config);
  const connector = await prisma.connector.upsert({
    where: { businessId_type: { businessId, type } },
    create: { businessId, type, configEnc, status: "CONNECTED", lastSyncAt: new Date() },
    update: { configEnc, status: "CONNECTED", lastSyncAt: new Date() },
  });

  return NextResponse.json({ ok: true, id: connector.id, type: connector.type, status: connector.status });
}
