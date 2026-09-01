"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus, Check, Loader2, Store } from "lucide-react";

interface Biz {
  id: string;
  name: string;
  short: string;
  cms: string;
  status: string;
}

/**
 * Header store-switcher for the multi-store dashboard. Loads the business roster
 * from /api/businesses, lets the operator switch the active store (sets a cookie
 * and reloads so every page re-scopes), and add a new Shopify store (then routes
 * to Connectors to wire it up).
 */
export function BusinessSwitcher() {
  const [businesses, setBusinesses] = useState<Biz[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    let alive = true;
    fetch("/api/businesses")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setBusinesses(d.businesses ?? []);
        setActiveId(d.activeId ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
        setAdding(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const active = businesses.find((b) => b.id === activeId) ?? businesses[0];

  async function switchTo(id: string) {
    if (id === activeId) return setOpen(false);
    setBusy(true);
    try {
      await fetch("/api/businesses/switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ businessId: id }),
      });
      window.location.reload();
    } catch {
      setBusy(false);
      setError("Couldn't switch — try again.");
    }
  }

  async function addStore(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const domain = String(form.get("domain") ?? "").trim();
    if (!name || !domain) return setError("Store name and domain are required.");
    setBusy(true);
    try {
      const res = await fetch("/api/businesses/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, domain }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      router.push("/connectors");
      router.refresh();
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Couldn't add the store.");
    }
  }

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-2.5 py-1.5 text-left hover:bg-[var(--surface-1)]"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--accent-bg)] text-xs font-medium text-[var(--accent)]">
          {active?.short ?? "··"}
        </span>
        <span>
          <span className="block text-[13px] font-medium leading-tight">
            {active?.name ?? "Loading…"}
          </span>
          {active && (
            <span className="block text-[10px] capitalize text-[var(--subtle)]">
              {active.cms} · {active.status}
            </span>
          )}
        </span>
        <ChevronDown size={15} className="text-[var(--subtle)]" />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-72 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-1 shadow-lg">
          {!adding ? (
            <>
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--subtle)]">
                Your stores
              </div>
              {businesses.map((b) => (
                <button
                  key={b.id}
                  disabled={busy}
                  onClick={() => switchTo(b.id)}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-[var(--surface-2)] disabled:opacity-60"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--accent-bg)] text-xs font-medium text-[var(--accent)]">
                    {b.short}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px]">{b.name}</span>
                    <span className="block text-[10px] capitalize text-[var(--subtle)]">{b.cms} · {b.status}</span>
                  </span>
                  {b.id === activeId && <Check size={14} className="shrink-0 text-[var(--success)]" />}
                </button>
              ))}
              <button
                onClick={() => {
                  setAdding(true);
                  setError(null);
                }}
                className="mt-1 flex w-full items-center gap-2 rounded-md border-t border-[var(--border)] px-2 py-2 text-[13px] text-[var(--accent)] hover:bg-[var(--surface-2)]"
              >
                <Plus size={14} /> Add a store
              </button>
            </>
          ) : (
            <form onSubmit={addStore} className="space-y-2 p-2">
              <div className="flex items-center gap-1.5 text-[12px] font-medium">
                <Store size={13} className="text-[var(--accent)]" /> Add a Shopify store
              </div>
              <input
                name="name"
                placeholder="Store name (e.g. Overnight Caskets)"
                autoFocus
                className="w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface-0)] px-2.5 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]"
              />
              <input
                name="domain"
                placeholder="Domain (e.g. overnightcaskets.com)"
                className="w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface-0)] px-2.5 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]"
              />
              <p className="text-[10px] text-[var(--subtle)]">
                Creates the store, then takes you to Connectors to link its Shopify + Search Console.
              </p>
              {error && <p className="text-[11px] text-[var(--danger)]">{error}</p>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="rounded-md border border-[var(--border-strong)] px-2.5 py-1 text-[12px] text-[var(--muted)] hover:bg-[var(--surface-2)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-2.5 py-1 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-60"
                >
                  {busy && <Loader2 size={12} className="animate-spin" />} Create
                </button>
              </div>
            </form>
          )}
          {error && !adding && <p className="px-2 py-1 text-[11px] text-[var(--danger)]">{error}</p>}
        </div>
      )}
    </div>
  );
}
