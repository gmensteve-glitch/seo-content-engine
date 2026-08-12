import { Shell } from "@/components/shell";
import { PageHeader, Card, Pill } from "@/components/ui";
import { getReadyToSchedule, getScheduledDrafts } from "@/lib/data/repo";
import {
  scheduleDraftAction,
  unscheduleDraftAction,
  publishNowAction,
} from "@/app/actions";
import type { ScheduledItemVM } from "@/lib/data/types";
import { CalendarDays, Rocket, Tag, X, Clock, AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** yyyy-mm-dd for a Date, in UTC (scheduledFor is stored/compared in UTC). */
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function CalendarPage() {
  const [ready, scheduled] = await Promise.all([
    getReadyToSchedule(),
    getScheduledDrafts(),
  ]);

  // Render the month that contains "today" (server clock).
  const today = new Date();
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth(); // 0-11
  const todayKey = ymd(today);

  // Bucket scheduled items by their calendar day (UTC).
  const byDay = new Map<string, ScheduledItemVM[]>();
  for (const s of scheduled) {
    const key = s.scheduledFor.slice(0, 10);
    const list = byDay.get(key) ?? [];
    list.push(s);
    byDay.set(key, list);
  }

  // Build the month grid: leading blanks + each day.
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  // Default schedule date for new items = today (in the picker).
  const minDate = todayKey;

  return (
    <Shell>
      <PageHeader
        title="Content calendar"
        subtitle="Park finished, graded pieces on a date. The scheduler publishes each one automatically when its day arrives — set it and let it roll out."
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        {/* Month grid */}
        <Card className="min-w-0">
          <div className="mb-3 flex items-center gap-2">
            <CalendarDays size={17} className="text-[var(--accent)]" />
            <h2 className="text-[15px] font-medium">
              {MONTHS[month]} {year}
            </h2>
            <span className="ml-auto text-[12px] text-[var(--muted)]">
              {scheduled.length} scheduled
            </span>
          </div>

          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-[var(--border)] text-[12px]">
            {WEEKDAYS.map((w) => (
              <div
                key={w}
                className="bg-[var(--surface-2)] px-2 py-1.5 text-center text-[11px] font-medium text-[var(--muted)]"
              >
                {w}
              </div>
            ))}
            {cells.map((day, i) => {
              if (day === null) {
                return <div key={i} className="min-h-[84px] bg-[var(--surface-1)]" />;
              }
              const key = ymd(new Date(Date.UTC(year, month, day)));
              const items = byDay.get(key) ?? [];
              const isToday = key === todayKey;
              return (
                <div
                  key={i}
                  className="min-h-[84px] bg-[var(--surface-1)] p-1.5 align-top"
                >
                  <div
                    className={`mb-1 flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                      isToday
                        ? "bg-[var(--accent)] font-semibold text-white"
                        : "text-[var(--muted)]"
                    }`}
                  >
                    {day}
                  </div>
                  <div className="space-y-1">
                    {items.map((it) => (
                      <div
                        key={it.id}
                        title={`${it.title} · grade ${it.overall}`}
                        className={`truncate rounded px-1.5 py-1 text-[10.5px] leading-tight ${
                          it.overdue
                            ? "bg-[var(--warn-bg)] text-[var(--warn)]"
                            : "bg-[var(--accent-bg)] text-[var(--accent)]"
                        }`}
                      >
                        {it.overdue && <Clock size={9} className="mr-0.5 inline" />}
                        {it.title}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Scheduled list (with unschedule / publish-now controls) */}
          {scheduled.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="text-[12px] font-medium text-[var(--muted)]">
                Scheduled queue
              </div>
              {scheduled.map((it) => (
                <div
                  key={it.id}
                  className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{it.title}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--muted)]">
                      <span className="flex items-center gap-1">
                        {it.overdue ? (
                          <AlertTriangle size={11} className="text-[var(--warn)]" />
                        ) : (
                          <CalendarDays size={11} />
                        )}
                        {new Date(it.scheduledFor).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                      <Pill tone={it.overall >= 85 ? "success" : "warn"}>{it.overall}</Pill>
                    </div>
                  </div>
                  <form action={publishNowAction}>
                    <input type="hidden" name="draftId" value={it.id} />
                    <button
                      className="flex items-center gap-1 rounded-md bg-[var(--success-bg)] px-2 py-1 text-[12px] font-medium text-[var(--success)]"
                      title="Publish immediately"
                    >
                      <Rocket size={12} /> Now
                    </button>
                  </form>
                  <form action={unscheduleDraftAction}>
                    <input type="hidden" name="draftId" value={it.id} />
                    <button
                      className="flex items-center gap-1 rounded-md border border-[var(--border-strong)] px-2 py-1 text-[12px] text-[var(--muted)]"
                      title="Remove from calendar"
                    >
                      <X size={12} />
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Ready to schedule */}
        <Card className="h-fit">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-[15px] font-medium">Ready to schedule</h2>
            <span className="ml-auto rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] text-[var(--muted)]">
              {ready.length}
            </span>
          </div>
          <p className="mb-3 text-[12px] text-[var(--muted)]">
            Finished pieces that cleared the quality bar. Pick a date to queue
            them, or publish now.
          </p>

          <div className="space-y-3">
            {ready.map((d) => (
              <div
                key={d.id}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 text-[13px] font-medium">{d.title}</div>
                  <Pill tone={d.overall >= 85 ? "success" : "warn"}>{d.overall}</Pill>
                </div>
                <div className="mt-1 flex items-center gap-1 text-[11px] text-[var(--muted)]">
                  <Tag size={11} /> {d.targetKeyword}
                </div>
                <form action={scheduleDraftAction} className="mt-2.5 flex items-center gap-1.5">
                  <input type="hidden" name="draftId" value={d.id} />
                  <input
                    type="date"
                    name="scheduledFor"
                    min={minDate}
                    defaultValue={minDate}
                    required
                    className="flex-1 rounded-md border border-[var(--border-strong)] bg-[var(--surface-1)] px-2 py-1 text-[12px]"
                  />
                  <button className="flex items-center gap-1 rounded-md bg-[var(--accent-bg)] px-2.5 py-1 text-[12px] font-medium text-[var(--accent)]">
                    <CalendarDays size={12} /> Queue
                  </button>
                </form>
                <form action={publishNowAction} className="mt-1.5">
                  <input type="hidden" name="draftId" value={d.id} />
                  <button className="flex w-full items-center justify-center gap-1 rounded-md border border-[var(--border-strong)] px-2 py-1 text-[12px] text-[var(--muted)]">
                    <Rocket size={12} /> Publish now
                  </button>
                </form>
              </div>
            ))}
            {ready.length === 0 && (
              <p className="rounded-lg bg-[var(--surface-2)] px-3 py-4 text-center text-[12px] text-[var(--muted)]">
                Nothing waiting. Approve a brief — passed drafts land here ready
                to schedule.
              </p>
            )}
          </div>
        </Card>
      </div>
    </Shell>
  );
}
