"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileUp, Loader2, PackageOpen, Trash2 } from "lucide-react";

type Summary = {
  ok: boolean;
  saved?: boolean;
  products: number;
  collections: { title: string; handle: string; products: number | null }[];
  errors: string[];
  warnings: string[];
  error?: string;
};

const CSV_EXAMPLE = `handle,title,type,collection,price,options,description
pet-casket-24,24 in Pet Casket,Pet Casket,Pet Caskets,129,Size: 24 in,"A 24 in pet casket, chosen by your pet's length."
brass-pet-urn,Brass Pet Urn,Pet Urn,Pet Urns,49|69,Size: Small|Large,A solid brass urn for your pet's ashes.`;

/**
 * "No Shopify connection" mode for the active store: upload or paste a product
 * list (JSON or CSV) and the titles of posts already on the store.
 */
export function ManualCatalogBox({
  storeName,
  current,
  postTitles,
}: {
  storeName: string;
  current: { products: number; collections: string[]; savedAt: string | null } | null;
  postTitles: string[] | null;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [posts, setPosts] = useState((postTitles ?? []).join("\n"));
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Summary | null>(null);
  const [postsMsg, setPostsMsg] = useState<string | null>(null);

  async function send(preview: boolean) {
    setBusy(preview ? "preview" : "save");
    setResult(null);
    try {
      const res = await fetch("/api/stores/manual-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, preview }),
      });
      const data = (await res.json()) as Summary;
      setResult(data);
      if (data.saved) {
        setText("");
        router.refresh();
      }
    } catch (e) {
      setResult({ ok: false, products: 0, collections: [], errors: [e instanceof Error ? e.message : "Failed"], warnings: [] });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!window.confirm(`Remove ${storeName}'s uploaded product list and pasted post titles?`)) return;
    setBusy("remove");
    await fetch("/api/stores/manual-catalog", { method: "DELETE" }).catch(() => {});
    setBusy(null);
    setResult(null);
    router.refresh();
  }

  async function savePosts() {
    setBusy("posts");
    setPostsMsg(null);
    try {
      const res = await fetch("/api/stores/manual-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: posts }),
      });
      const data = (await res.json()) as { titles?: number; error?: string };
      setPostsMsg(res.ok ? (data.titles ? `Saved ${data.titles} post title${data.titles === 1 ? "" : "s"}.` : "Saved: this store has no posts yet.") : data.error ?? "Failed");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {current && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--success)] bg-[var(--success-bg)] px-3 py-2 text-[12px] text-[var(--success)]">
          <CheckCircle2 size={14} />
          <span>
            Using an uploaded list of <b>{current.products} products</b> in {current.collections.length} collection
            {current.collections.length === 1 ? "" : "s"} ({current.collections.join(", ")})
            {current.savedAt ? `, saved ${new Date(current.savedAt).toLocaleString()}` : ""}.
          </span>
          <button
            type="button"
            onClick={remove}
            disabled={busy !== null}
            className="ml-auto flex items-center gap-1 rounded-md border border-[var(--border-strong)] px-2 py-1 text-[11px] text-[var(--muted)] hover:bg-[var(--surface-2)]"
          >
            <Trash2 size={11} /> Remove
          </button>
        </div>
      )}

      <div>
        <div className="mb-1 text-[12px] font-medium">{current ? "Replace the product list" : "Product list"}</div>
        <p className="mb-2 text-[11.5px] text-[var(--muted)]">
          JSON or CSV. Columns: <code>handle</code>, <code>title</code> (required), <code>type</code>,{" "}
          <code>collection</code> (several separated by <code>;</code>), <code>price</code> (one per size, separated by{" "}
          <code>|</code>), <code>options</code> (<code>Size: 20 in|24 in; Color: Black</code>), <code>description</code>.
          Uploading replaces the whole list.
        </p>
        <div className="mb-2 flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border-strong)] px-2.5 py-1.5 text-[12px] hover:bg-[var(--surface-2)]">
            <FileUp size={13} /> Choose a .csv or .json file
            <input
              type="file"
              accept=".csv,.json,.txt,text/csv,application/json,text/plain"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setText(await f.text());
              }}
            />
          </label>
          <span className="text-[11px] text-[var(--muted)]">or paste below</span>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder={CSV_EXAMPLE}
          className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-2 font-mono text-[11.5px] outline-none focus:border-[var(--accent)]"
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => send(true)}
            disabled={busy !== null || !text.trim()}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-[12px] hover:bg-[var(--surface-2)] disabled:opacity-60"
          >
            {busy === "preview" ? <Loader2 size={13} className="animate-spin" /> : <PackageOpen size={13} />} Check
          </button>
          <button
            type="button"
            onClick={() => send(false)}
            disabled={busy !== null || !text.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-white hover:brightness-110 disabled:opacity-60"
          >
            {busy === "save" ? <Loader2 size={13} className="animate-spin" /> : <FileUp size={13} />} Save product list
          </button>
        </div>
        {result && (
          <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-[12px]">
            <p className={result.ok ? "text-[var(--success)]" : "text-[var(--danger)]"}>
              {result.ok
                ? `${result.saved ? "Saved" : "Looks good"}: ${result.products} products in ${result.collections.length} collection${result.collections.length === 1 ? "" : "s"}${result.collections.length ? ` (${result.collections.map((c) => `${c.title}: ${c.products}`).join(", ")})` : ""}.${result.saved ? " Run “Rescan site” on Category pages to pick up the collections." : ""}`
                : result.error ?? "Nothing was saved."}
            </p>
            {[...result.errors.map((e) => ({ e, bad: true })), ...result.warnings.map((e) => ({ e, bad: false }))].map(({ e, bad }) => (
              <p key={e} className={`mt-1 flex items-start gap-1 ${bad ? "text-[var(--danger)]" : "text-[var(--warn)]"}`}>
                <AlertTriangle size={11} className="mt-0.5 shrink-0" /> {e}
              </p>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-1 text-[12px] font-medium">Blog posts already on {storeName}</div>
        <p className="mb-2 text-[11.5px] text-[var(--muted)]">
          One title per line. Leave it empty if the store has no posts yet. New ideas are checked against these.
        </p>
        <textarea
          value={posts}
          onChange={(e) => setPosts(e.target.value)}
          rows={4}
          placeholder={"How to Choose a Pet Casket\nWhat Size Urn Do I Need for My Dog?"}
          className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-2 text-[12.5px] outline-none focus:border-[var(--accent)]"
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={savePosts}
            disabled={busy !== null}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-white hover:brightness-110 disabled:opacity-60"
          >
            {busy === "posts" ? <Loader2 size={13} className="animate-spin" /> : null} Save post titles
          </button>
          {postsMsg && <span className="text-[12px] text-[var(--success)]">{postsMsg}</span>}
        </div>
      </div>
    </div>
  );
}
