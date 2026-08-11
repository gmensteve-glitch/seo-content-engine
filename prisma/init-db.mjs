// Pre-deploy database init: apply migrations, then seed sample data ONLY when
// the database is empty. Safe to run on every deploy — it never wipes existing
// data (if any business exists, seeding is skipped).

import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

console.log("[init-db] applying migrations...");
execSync("node_modules/.bin/prisma migrate deploy", { stdio: "inherit" });

const prisma = new PrismaClient();
const count = await prisma.business.count();
await prisma.$disconnect();

if (count === 0) {
  console.log("[init-db] empty database — seeding sample data...");
  execSync("node prisma/seed.mjs", { stdio: "inherit" });
} else {
  console.log(`[init-db] ${count} businesses present — skipping seed.`);
}
