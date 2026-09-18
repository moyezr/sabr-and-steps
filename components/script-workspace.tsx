"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpen, RefreshCw } from "lucide-react";
import {
  useEpisodeWorkspace,
  useWorkspaceBuffer,
  useWorkspaceDraft,
} from "./episode-workspace";
import type { WritingState } from "@/lib/server/writing/state";
import { narrationText, type ScriptBlock } from "@/lib/domain/script";
export function ScriptWorkspace({ initial }: { initial: WritingState }) {
  const [state, setState] = useState(initial);
  const { refreshWorkspace } = useEpisodeWorkspace();
  const [draft, setDraft, clearDraft] = useWorkspaceBuffer<{
    selectedId: string;
    edit: { id: string; blocks: ScriptBlock[]; title: string } | null;
    dirty: boolean;
  }>(`script:${initial.episode.id}`, {
    selectedId: initial.scripts[0]?.id || "",
    edit: null,
    dirty: false,
  });
  const { selectedId, edit, dirty } = draft;
  const selected =
    state.scripts.find((s) => s.id === selectedId) || state.scripts[0];
  const blocks =
    edit && edit.id === selected?.id ? edit.blocks : selected?.blocks || [];
  const title =
    edit && edit.id === selected?.id ? edit.title : selected?.title || "";
  function setBlocks(update: (items: ScriptBlock[]) => ScriptBlock[]) {
    if (selected)
      setDraft((current) => ({
        ...current,
        edit: { id: selected.id, blocks: update(blocks), title },
        dirty: true,
      }));
  }
  function setTitle(value: string) {
    if (selected)
      setDraft((current) => ({
        ...current,
        edit: { id: selected.id, blocks, title: value },
        dirty: true,
      }));
  }
  const initialEdition = initial.editions[0]?.id || "";
  const [edition, setEdition] = useWorkspaceBuffer(
    `script:edition:${initial.episode.id}`,
    initialEdition,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useWorkspaceDraft({ dirty: dirty || edition !== initialEdition, saving: busy });
  const active = state.jobs.some((j) =>
    ["queued", "running"].includes(j.status),
  );
  async function refresh() {
    const r = await fetch(`/api/episodes/${state.episode.id}/writing`);
    if (!r.ok)
      throw new Error("Could not refresh writing. Your edits are still here.");
    const next: WritingState = await r.json();
    setState(next);
    return next;
  }
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const timer = setInterval(() => {
      void fetch(`/api/episodes/${initial.episode.id}/writing`)
        .then(async (r) => {
          if (r.ok && !stopped) setState(await r.json());
        })
        .catch(() => undefined);
    }, 2000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [active, initial.episode.id]);
  async function act(action: string, data: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/episodes/${state.episode.id}/writing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, data }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || "Request failed");
      const next = await refresh();
      void refreshWorkspace();
      if (action === "save") {
        let hasNewEdits = false;
        setDraft((current) => {
          hasNewEdits = current.edit !== edit;
          return hasNewEdits
            ? current
            : { selectedId: next.scripts[0].id, edit: null, dirty: false };
        });
        if (!hasNewEdits) clearDraft();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  const editionInfo = state.editions.find(
    (e) => e.id === (selected?.importId || edition),
  );
  return (
    <>
      <header className="workspace-section-heading">
        <h2>Script & sources</h2>
        <p>Shape your reflection. Keep quotations and their context intact.</p>
      </header>
      {error && (
        <p className="source-notice" role="alert">
          {error}
        </p>
      )}
      <section className="panel writing-generation">
        <label>
          Source edition
          <select value={edition} onChange={(e) => setEdition(e.target.value)}>
            {state.editions.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} · {e.coverage}/114 chapters · {e.environment}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button primary-action"
          disabled={busy || active || !edition || dirty}
          onClick={() =>
            void act("generate", {
              importId: edition,
              episodeRevision: state.episode.revision,
            })
          }
        >
          {active ? "Draft in progress…" : "Generate draft"}
        </button>
        <button
          className="button"
          disabled={busy}
          onClick={() => void refresh().catch((e) => setError(e.message))}
        >
          <RefreshCw size={14} /> Refresh
        </button>
        <p>
          Uses {state.episode.llmModel}. Each model request is capped at an
          estimated $0.10; completed requests are reused. Generation continues
          in the background and its status appears below.
        </p>
      </section>
      {state.jobs
        .filter((j) => j.kind === "draft")
        .slice(0, 3)
        .map((job) => (
          <div key={job.id} className="writing-job panel" role="status">
            <strong>{job.status.replaceAll("_", " ")}</strong>
            <span>{job.progress}</span>
            {job.error && (
              <span>
                {job.error === "NO_SUPPORTING_SOURCE"
                  ? "No supporting source was found in the available corpus. Try a different brief; missing coverage is not a theological conclusion."
                  : job.error}
              </span>
            )}
            {job.status === "failed" && (
              <button
                className="text-link"
                disabled={busy}
                onClick={() => void act("retry", { jobId: job.id })}
              >
                Retry stopped job
              </button>
            )}
          </div>
        ))}
      {!selected ? (
        <section className="empty-state panel">
          <BookOpen />
          <h2>Your first draft starts with a source.</h2>
          <p>
            Generate from the saved brief, then inspect each quotation beside
            its context.
          </p>
        </section>
      ) : (
        <>
          <div className="section-heading">
            <h2>Script revision</h2>
            <select
              aria-label="Script revision"
              disabled={dirty}
              value={selected.id}
              onChange={(e) => {
                setDraft({
                  selectedId: e.target.value,
                  edit: null,
                  dirty: false,
                });
                clearDraft();
              }}
            >
              {state.scripts.map((s, i) => (
                <option key={s.id} value={s.id}>
                  {i === 0 ? "Latest · " : ""}
                  {s.createdAt.slice(0, 19).replace("T", " ")} · {s.reviewState}
                </option>
              ))}
            </select>
          </div>
          <p className="source-notice">
            {editionInfo?.rightsStatus === "cleared"
              ? "Edition reuse cleared."
              : "Publication reuse is not cleared for this edition. Private draft inspection only."}{" "}
            {selected.episodeRevision !== state.episode.revision
              ? "This script was created for an older episode brief."
              : ""}
          </p>
          <div className="writing-columns">
            <section className="panel writing-editor">
              <label className="writing-title">
                Working title
                <input
                  value={title}
                  maxLength={140}
                  onChange={(e) => {
                    setTitle(e.target.value);
                  }}
                />
              </label>
              {blocks.map((block, index) => (
                <div
                  key={`${selected.id}-${index}`}
                  className={`script-block ${block.kind}`}
                >
                  <div className="eyebrow">
                    {block.kind === "quote"
                      ? `QUR’AN ${block.reference} · CANONICAL TRANSLATION`
                      : "ORIGINAL REFLECTION"}
                  </div>
                  {block.kind === "quote" ? (
                    <>
                      <p translate="no">{block.text}</p>
                      <small>{block.edition}</small>
                      <Link
                        className="text-link"
                        href={`/sources?edition=${block.importId}&reference=${block.reference}`}
                      >
                        Inspect verse context
                      </Link>
                    </>
                  ) : (
                    <textarea
                      aria-label={`Reflection ${index + 1}`}
                      value={block.text}
                      rows={Math.max(3, Math.ceil(block.text.length / 70))}
                      onChange={(e) => {
                        setBlocks((items) =>
                          items.map((b, i) =>
                            i === index
                              ? { kind: "reflection", text: e.target.value }
                              : b,
                          ),
                        );
                      }}
                    />
                  )}
                </div>
              ))}
              <div className="writing-actions">
                <span>
                  {narrationText(blocks).split(/\s+/).filter(Boolean).length}{" "}
                  spoken words · {selected.reviewState}
                </span>
                <button
                  className="button primary-action"
                  disabled={busy || !dirty}
                  onClick={() =>
                    void act("save", { parentId: selected.id, title, blocks })
                  }
                >
                  Save new revision
                </button>
                <button
                  className="button"
                  disabled={
                    busy ||
                    dirty ||
                    selected.reviewState === "reviewed" ||
                    selected.id !== state.scripts[0].id ||
                    selected.episodeRevision !== state.episode.revision
                  }
                  onClick={() =>
                    void act("review", {
                      scriptId: selected.id,
                      checksum: selected.checksum,
                      notes:
                        "Creator reviewed wording and source context in the script workspace.",
                    })
                  }
                >
                  Mark script reviewed
                </button>
              </div>
              <p className="writing-helper">
                Review belongs to this exact revision. Editing creates a new
                unreviewed version. Script review does not clear publication
                rights.
              </p>
            </section>
            <aside className="panel writing-context">
              <h2>Source context</h2>
              <p>
                Retrieved passages are candidates, not proof of interpretation.
                Read the surrounding verses before reviewing.
              </p>
              {selected.sources
                .filter((s) =>
                  blocks.some((b) => b.kind === "quote" && b.sourceId === s.id),
                )
                .map((s) => (
                  <section key={s.id}>
                    <h3>Qur’an {s.reference}</h3>
                    <small>{s.edition}</small>
                    {s.context.map((c) => (
                      <p
                        key={c.reference}
                        translate="no"
                        className={
                          c.reference === s.reference ? "context-focus" : ""
                        }
                      >
                        <strong>{c.reference}</strong> {c.text}
                      </p>
                    ))}
                  </section>
                ))}
            </aside>
          </div>
        </>
      )}
    </>
  );
}
