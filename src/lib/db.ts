// Prisma client singleton.
// Next.js dev hot-reloads modules, which would otherwise open a new connection
// pool on every reload and exhaust the database. Cache the client on globalThis
// so the whole app (repo layer, agents, jobs) shares one instance.

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/** True when a database is configured. Lets the repo layer fall back to the
 *  mock seed for zero-setup `npm run dev`. */
export const hasDatabase = Boolean(process.env.DATABASE_URL);
