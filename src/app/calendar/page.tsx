import Link from "next/link";
import { Shell } from "@/components/shell";
import { PageHeader, Card, Pill } from "@/components/ui";
import {
  getReadyToSchedule,
  getScheduledDrafts,
  getCalendarEntries,
} from "@/lib/data/repo";
import type { CalendarEntryVM } from "@/lib/data/types";
import {
  scheduleDraftAction,
  unscheduleDraftAction,
  publishNowAction,
} from "@/app/actions";
import {
  CalendarDays,
  Rocket,
  Tag,
  X,
  Clock,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";

export const dynamic = "force-dynamic";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** "2026-08" → {year, month}. Falls back to the current UTC month. */
function parseMonth(m?: string): { year: number; month: number } {
  const now = new Date();
  if (m && /^\d{4}-\d{2}$/.test(m)) {
    const [y, mm] = m.split("-").map(Number);
    if (mm >= 1 && mm <= 12) return { year: y, month: mm - 1 };
  }
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() };
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

const CHIP: Record<CalendarEntryVM["kind"], { cls: string; label: string }> = {
  published: { cls: "bg-[var(--success-bg)] text-[var(--success)]", label: "PUBLISHED" },
  scheduled: { cls: "bg-[var(--accent-bg)] text-[var(--accent)]", label: "SCHEDULED" },
  overdue: { cls: "bg-[var(--warn-bg)] text-[var(--warn)]", label: "DUE" },
};

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { m } = await searchParams;
  const { year, month } = parseMonth(m);

  const [ready, scheduled, entries] = await Promise.all([
    getReadyToSchedule(),
    getScheduledDrafts(),
    getCalendarEntries(),
  ]);

  const today = new Date();
  const todayKey = ymd(today);
  const thisMonthKey = monthKey(today.getUTCFullYear(), today.getUTCMonth());

  // Bucket calendar entries by day.
  const byDay = new Map<string, CalendarEntryVM[]>();
  for (const e of entries) {
    const key = e.date.slice(0, 10);
    const list = byDay.get(key) ?? [];
    list.push(e);
    byDay.set(key, list);
  }

  // Month grid cells.
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const prevKey = monthKey(month === 0 ? year - 1 : year, (month + 11) % 12);
  const nextKey = monthKey(month === 11 ? year + 1 : year, (month + 1) % 12);

  const minDateTime = `${todayKey}T09:00`;

  return (
    <Shell>
      <PageHeader
        title="Content calendar"
        subtitle="Your publishing calendar, month to month. Finished pieces auto-publish on the day and time you set — set it and let it roll out."
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        {/* Month grid */}
        <Card className="min-w-0">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Link
                href="/calendar"
                className="rounded-md border border-[var(--border-strong)] px-2 py-1 text-[12px] hover:bg-[var(--surface-2)]"
              >
                Today
              </Link>
              <Link
                href={`/calendar?m=${prevKey}`}
                className="flex items-center rounded-md border border-[var(--border-strong)] p-1 hover:bg-[var(--surface-2)]"
                aria-label="Previous month"
              >
                <ChevronLeft size={16} />
              </Link>
              <Link
                href={`/calendar?m=${nextKey}`}
                className="flex items-center rounded-md border border-[var(--border-strong)] p-1 hover:bg-[var(--surface-2)]"
                aria-label="Next month"
              >
                <ChevronRight size={16} />
              </Link>
            </div>
            <h2 className="ml-1 text-[15px] font-medium">
              {MONTHS[month]} {year}
            </h2>
            <div className="ml-auto flex items-center gap-3 text-[11px] text-[var(--muted)]">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-[var(--success)]" /> Published
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-[var(--accent)]" /> Scheduled
              </span>
            </div>
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
                return <div key={i} className="min-h-[96px] bg-[var(--surface-1)]" />;
              }
              const key = ymd(new Date(Date.UTC(year, month, day)));
              const items = (byDay.get(key) ?? []).sort((a, b) =>
                a.time.localeCompare(b.time),
              );
              const isToday = key === todayKey;
              return (
                <div key={i} className="min-h-[96px] bg-[var(--surface-1)] p-1.5 align-top">
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
                    {items.slice(0, 4).map((it) => {
                      const c = CHIP[it.kind];
                      return (
                        <div
                          key={`${it.kind}-${it.id}`}
                          title={`${it.time} · ${c.label} · ${it.title}`}
                          className={`truncate rounded px-1.5 py-1 text-[10.5px] leading-tight ${c.cls}`}
                        >
                          <span className="font-medium">{it.time}</span> {it.title}
                        </div>
                      );
                    })}
                    {items.length > 4 && (
                      <div className="px-1 text-[10px] text-[var(--muted)]">
                        +{items.length - 4} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Scheduled queue (controls) */}
          {scheduled.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="text-[12px] font-medium text-[var(--muted)]">
                Scheduled queue ({scheduled.length})
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
                          <Clock size={11} className="text-[var(--warn)]" />
                        ) : (
                          <CalendarDays size={11} />
                        )}
                        {new Date(it.scheduledFor).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                          timeZone: "UTC",
                        })}{" "}
                        UTC
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
            Finished pieces that cleared the quality bar. Pick a date &amp; time to
            queue them, or publish now.
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
                    type="datetime-local"
                    name="scheduledFor"
                    min={minDateTime}
                    defaultValue={minDateTime}
                    required
                    className="min-w-0 flex-1 rounded-md border border-[var(--border-strong)] bg-[var(--surface-1)] px-2 py-1 text-[12px]"
                  />
                  <button className="flex shrink-0 items-center gap-1 rounded-md bg-[var(--accent-bg)] px-2.5 py-1 text-[12px] font-medium text-[var(--accent)]">
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
              <div className="rounded-lg bg-[var(--surface-2)] px-3 py-4 text-center text-[12px] text-[var(--muted)]">
                <CheckCircle2 size={18} className="mx-auto mb-1 text-[var(--muted)]" />
                Nothing waiting. Approve a brief — passed drafts land here ready to
                schedule.
              </div>
            )}
          </div>

          {thisMonthKey !== monthKey(year, month) && (
            <Link
              href="/calendar"
              className="mt-3 block text-center text-[11px] text-[var(--accent)] hover:underline"
            >
              ← Back to this month
            </Link>
          )}
        </Card>
      </div>
    </Shell>
  );
}
