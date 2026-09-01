"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Target,
  Lightbulb,
  ClipboardCheck,
  Columns3,
  CheckCircle2,
  Sparkles,
  LineChart,
  MapPin,
  Plug,
  Plus,
  ChevronDown,
  Layers,
  LogOut,
  Search,
} from "lucide-react";
import { BUSINESSES } from "@/lib/mock/seed";

// Grouped nav — chunked into a few labelled sections so the sidebar reads as
// "what do I do / what do I make / what do I check / setup" instead of a flat
// list of 11 items. Lower cognitive load, easier to scan.
const NAV_GROUPS: {
  header: string | null;
  items: { href: string; label: string; icon: typeof LayoutDashboard }[];
}[] = [
  {
    header: null,
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/pipeline", label: "Pipeline", icon: Columns3 },
    ],
  },
  {
    // Same left-to-right order as the pipeline board: idea → brief → review →
    // schedule. The sidebar reads top-to-bottom exactly how work flows.
    header: "Workflow",
    items: [
      { href: "/ideas", label: "Ideas", icon: Lightbulb },
      { href: "/briefs", label: "Briefs", icon: ClipboardCheck },
      { href: "/review", label: "Review", icon: Sparkles },
      { href: "/ready", label: "Ready to publish", icon: CheckCircle2 },
    ],
  },
  {
    header: "Measure",
    items: [
      { href: "/performance", label: "Performance", icon: LineChart },
      { href: "/geo", label: "Geo", icon: MapPin },
    ],
  },
  {
    header: "Setup",
    items: [
      { href: "/strategy", label: "Strategy", icon: Target },
      { href: "/connectors", label: "Connectors", icon: Plug },
    ],
  },
];

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [bizId, setBizId] = useState(BUSINESSES[0].id);
  const [open, setOpen] = useState(false);
  const biz = BUSINESSES.find((b) => b.id === bizId) ?? BUSINESSES[0];

  return (
    <div className="flex h-screen flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-1)] px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-2.5 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-2.5 py-1.5 text-left hover:bg-[var(--surface-1)]"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--accent-bg)] text-xs font-medium text-[var(--accent)]">
                {biz.short}
              </span>
              <span>
                <span className="block text-[13px] font-medium leading-tight">{biz.name}</span>
                <span className="block text-[10px] capitalize text-[var(--subtle)]">
                  {biz.cms} · {biz.status}
                </span>
              </span>
              <ChevronDown size={15} className="text-[var(--subtle)]" />
            </button>
            {open && (
              <div className="absolute z-20 mt-1 w-64 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-1 shadow-lg">
                {BUSINESSES.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => {
                      setBizId(b.id);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-[var(--surface-2)]"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--accent-bg)] text-xs font-medium text-[var(--accent)]">
                      {b.short}
                    </span>
                    <span className="text-[13px]">{b.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="hidden items-center gap-1.5 text-[11px] text-[var(--subtle)] sm:flex">
            <Layers size={13} /> {BUSINESSES.length} businesses
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`https://search.google.com/search-console?resource_id=sc-domain%3A${encodeURIComponent(biz.domain)}`}
            target="_blank"
            rel="noreferrer"
            title="Open Google Search Console"
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-2.5 py-1.5 text-[12px] text-[var(--muted)] hover:bg-[var(--surface-2)]"
          >
            <Search size={14} /> <span className="hidden sm:inline">Search Console ↗</span>
          </a>
          <button className="flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-2.5 py-1.5 text-[12px] hover:bg-[var(--surface-2)]">
            <Plus size={14} /> Add business
          </button>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              title="Sign out"
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-2.5 py-1.5 text-[12px] text-[var(--muted)] hover:bg-[var(--surface-2)]"
            >
              <LogOut size={14} />
            </button>
          </form>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <nav className="w-52 shrink-0 overflow-y-auto border-r border-[var(--border)] bg-[var(--surface-1)] p-2">
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi} className={gi > 0 ? "mt-4" : ""}>
              {group.header && (
                <div className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--subtle)]">
                  {group.header}
                </div>
              )}
              {group.items.map((item) => {
                const active =
                  item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`mb-0.5 flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] ${
                      active
                        ? "bg-[var(--accent-bg)] font-medium text-[var(--accent)]"
                        : "text-[var(--muted)] hover:bg-[var(--surface-2)]"
                    }`}
                  >
                    <Icon size={16} />
                    <span className="flex-1">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Main */}
        <main className="min-w-0 flex-1 overflow-y-auto bg-[var(--surface-0)] p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
