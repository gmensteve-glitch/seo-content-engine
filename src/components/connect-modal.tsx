"use client";

import { useState, useTransition } from "react";
import { Loader2, Plug, Pencil, X } from "lucide-react";
import { connectConnectorAction, disconnectConnectorAction } from "@/app/actions";
import { CONNECTOR_SPECS, isConnectable } from "@/lib/connectors/connect-fields";
import type { ConnectorVM } from "@/lib/data/types";

/**
 * Per-connector controls on the Connectors page: a Connect/Edit button that
 * opens a credential modal (fields defined per type), and a Disconnect for
 * connectors whose credentials are stored in the app. Env-only connectors
 * (not connectable) render nothing here — they're managed by deploy config.
 */
export function ConnectorControls({ connector }: { connector: ConnectorVM }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!isConnectable(connector.type)) return null;
  const spec = CONNECTOR_SPECS[connector.type];

  function save(formData: FormData) {
    setError(null);
    // Client-side required check so the modal can show a clear message.
    for (const f of spec.fields) {
      if (f.required && !String(formData.get(f.name) ?? "").trim()) {
        setError(`${f.label} is required.`);
        return;
      }
    }
    start(async () => {
      try {
        await connectConnectorAction(formData);
        setOpen(false);
      } catch {
        setError("Couldn't save — check the values and try again.");
      }
    });
  }

  function disconnect(formData: FormData) {
    start(async () => {
      try {
        await disconnectConnectorAction(formData);
      } catch {
        /* best-effort; page revalidates on success */
      }
    });
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
          className="flex items-center gap-1.5 rounded-md border border-[var(--border-strong)] px-2.5 py-1 text-[12px] hover:bg-[var(--surface-2)]"
        >
          {connector.managed ? <Pencil size={12} /> : <Plug size={12} />}
          {connector.managed ? "Edit" : "Connect"}
        </button>
        {connector.managed && (
          <form action={disconnect}>
            <input type="hidden" name="type" value={connector.type} />
            <button
              type="submit"
              disabled={pending}
              className="rounded-md border border-[var(--border-strong)] px-2.5 py-1 text-[12px] text-[var(--muted)] hover:bg-[var(--surface-2)] disabled:opacity-60"
            >
              Disconnect
            </button>
          </form>
        )}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-[15px] font-medium">Connect {connector.label}</h3>
              <button onClick={() => setOpen(false)} className="text-[var(--subtle)] hover:text-[var(--text)]">
                <X size={16} />
              </button>
            </div>
            {spec.note && <p className="mb-3 text-[12px] leading-relaxed text-[var(--muted)]">{spec.note}</p>}
            {spec.wired ? (
              <p className="mb-3 rounded-md bg-[var(--success-bg)] px-2.5 py-1.5 text-[11px] text-[var(--success)]">
                Live — the engine publishes here as soon as you save.
              </p>
            ) : (
              <p className="mb-3 rounded-md bg-[var(--surface-2)] px-2.5 py-1.5 text-[11px] text-[var(--muted)]">
                Saved securely (encrypted) for the engine to use as it reads this source.
              </p>
            )}

            <form action={save} className="space-y-3">
              <input type="hidden" name="type" value={connector.type} />
              {spec.fields.map((f) => (
                <label key={f.name} className="block">
                  <span className="mb-1 block text-[12px] font-medium">{f.label}</span>
                  <input
                    name={f.name}
                    type={f.type === "password" ? "password" : "text"}
                    placeholder={f.placeholder}
                    autoComplete="off"
                    className="w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface-0)] px-2.5 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]"
                  />
                  {f.help && <span className="mt-1 block text-[11px] text-[var(--subtle)]">{f.help}</span>}
                </label>
              ))}
              {error && <p className="text-[12px] text-[var(--danger)]">{error}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-[var(--border-strong)] px-3 py-1.5 text-[12px] text-[var(--muted)] hover:bg-[var(--surface-2)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-60"
                >
                  {pending && <Loader2 size={13} className="animate-spin" />}
                  Save &amp; connect
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
