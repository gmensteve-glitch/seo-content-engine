// Next.js instrumentation — `register()` runs ONCE when the server boots
// (see node_modules/next/dist/docs/01-app/02-guides/instrumentation.md).
// We use it to start the in-process content scheduler on the Node.js runtime
// only (never Edge), so the calendar auto-rolls-out without any external cron.

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startScheduler } = await import("@/lib/jobs/scheduler");
  startScheduler();
}
