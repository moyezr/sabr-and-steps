"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, RefreshCw } from "lucide-react";
import {
  useEpisodeWorkspace,
  useWorkspaceBuffer,
  useWorkspaceDraft,
} from "./episode-workspace";
import type { WritingState } from "@/lib/server/writing/state";
import { narrationText, type ScriptBlock } from "@/lib/domain/script";

type LocalDraft = {
  selectedId: string;
  edit: {
    baseScriptId: string;
    blocks: ScriptBlock[];
    title: string;
    revision: number;
  } | null;
  dirty: boolean;
};

type AutosaveState = "idle" | "saving" | "saved" | "error" | "conflict";

class WritingRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function localDraftFromState(state: WritingState): LocalDraft {
  const selectedId = state.selectedScriptId || state.scripts[0]?.id || "";
  const working = state.workingDraft;
  return {
    selectedId,
    edit:
      working?.baseScriptId === selectedId
        ? {
            baseScriptId: selectedId,
            blocks: working.blocks,
            title: working.title,
            revision: working.revision,
          }
        : null,
    dirty: false,
  };
}

function readableError(code: string) {
  if (code === "SCRIPT_DRAFT_CONFLICT")
    return "This working draft changed elsewhere. Your local words are still here.";
  if (
    code === "SCRIPT_SELECTION_CONFLICT" ||
    code === "SCRIPT_SELECTION_CHANGED"
  )
    return "The selected version changed elsewhere. Your local words are still here.";
  if (code === "SCRIPT_DRAFT_EXISTS")
    return "Save or discard the current working draft before changing versions.";
  if (code === "CANONICAL_QUOTATION_CHANGED")
    return "Canonical quotation wording cannot be changed in the script editor.";
  return code.replaceAll("_", " ");
}

export function ScriptWorkspace({ initial }: { initial: WritingState }) {
  const [state, setState] = useState(initial);
  const { refreshWorkspace } = useEpisodeWorkspace();
  const [draft, setDraft] = useWorkspaceBuffer<LocalDraft>(
    `script:${initial.episode.id}`,
    localDraftFromState(initial),
  );
  const initialEdition = initial.editions[0]?.id || "";
  const [edition, setEdition] = useWorkspaceBuffer(
    `script:edition:${initial.episode.id}`,
    initialEdition,
  );
  const [generationInstructions, setGenerationInstructions] =
    useWorkspaceBuffer(`script:instructions:${initial.episode.id}`, "");
  const [versionLabel, setVersionLabel] = useWorkspaceBuffer(
    `script:version-label:${initial.episode.id}`,
    `Version ${initial.scripts.length + 1}`,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [autosave, setAutosave] = useState<AutosaveState>(
    initial.workingDraft ? "saved" : "idle",
  );
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const { selectedId, edit, dirty } = draft;
  const selected =
    state.scripts.find((script) => script.id === selectedId) ||
    state.scripts.find((script) => script.id === state.selectedScriptId) ||
    state.scripts[0];
  const blocks = useMemo(
    () =>
      edit?.baseScriptId === selected?.id
        ? edit.blocks
        : selected?.blocks || [],
    [edit, selected],
  );
  const title =
    edit?.baseScriptId === selected?.id
      ? edit.title
      : selected?.title || "";
  const blocksKey = JSON.stringify(blocks);
  const active = state.jobs.some((job) =>
    ["queued", "running"].includes(job.status),
  );
  const promptDirty =
    edition !== initialEdition ||
    generationInstructions.trim().length > 0;
  useWorkspaceDraft({
    dirty:
      dirty ||
      autosave === "error" ||
      autosave === "conflict" ||
      promptDirty,
    saving: busy || autosave === "saving",
  });

  function beginEdit(nextTitle: string, nextBlocks: ScriptBlock[]) {
    if (!selected) return;
    setDraft((current) => ({
      selectedId: selected.id,
      edit: {
        baseScriptId: selected.id,
        blocks: nextBlocks,
        title: nextTitle,
        revision:
          current.edit?.baseScriptId === selected.id
            ? current.edit.revision
            : state.workingDraft?.baseScriptId === selected.id
              ? state.workingDraft.revision
              : 0,
      },
      dirty: true,
    }));
    setAutosave((current) => (current === "saving" ? "saving" : "idle"));
    setError("");
  }

  function setBlocks(update: (items: ScriptBlock[]) => ScriptBlock[]) {
    beginEdit(title, update(blocks));
  }

  function setTitle(value: string) {
    beginEdit(value, blocks);
  }

  const writingRequest = useCallback(
    async (action: string, data: unknown) => {
      const response = await fetch(
        `/api/episodes/${state.episode.id}/writing`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, data }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new WritingRequestError(
          result.error || "WRITING_REQUEST_FAILED",
          response.status,
        );
      return result as WritingState | { jobId: string };
    },
    [state.episode.id],
  );

  async function refresh() {
    const response = await fetch(`/api/episodes/${state.episode.id}/writing`);
    if (!response.ok)
      throw new Error("Could not refresh writing. Your edits are still here.");
    const next: WritingState = await response.json();
    if (mounted.current) setState(next);
    return next;
  }

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const timer = setInterval(() => {
      void fetch(`/api/episodes/${initial.episode.id}/writing`)
        .then(async (response) => {
          if (!response.ok || stopped) return;
          const next: WritingState = await response.json();
          setState(next);
          setDraft((current) =>
            current.selectedId || !next.selectedScriptId
              ? current
              : localDraftFromState(next),
          );
          if (
            !next.jobs.some((job) =>
              ["queued", "running"].includes(job.status),
            )
          )
            void refreshWorkspace();
        })
        .catch(() => undefined);
    }, 2000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [active, initial.episode.id, refreshWorkspace, setDraft]);

  useEffect(() => {
    if (
      !dirty ||
      !selected ||
      !edit ||
      busy ||
      autosave === "saving" ||
      autosave === "error" ||
      autosave === "conflict"
    )
      return;
    const snapshot = {
      baseScriptId: selected.id,
      revision: edit.revision,
      title,
      blocks,
    };
    const snapshotKey = JSON.stringify({ title, blocks });
    const timer = setTimeout(() => {
      setAutosave("saving");
      void writingRequest("autosave", snapshot)
        .then((result) => {
          if (!mounted.current || !("episode" in result)) return;
          const next = result as WritingState;
          const saved = next.workingDraft;
          let hasNewEdits = false;
          setState(next);
          setDraft((current) => {
            if (
              !current.edit ||
              current.edit.baseScriptId !== snapshot.baseScriptId
            )
              return current;
            hasNewEdits =
              JSON.stringify({
                title: current.edit.title,
                blocks: current.edit.blocks,
              }) !== snapshotKey;
            return {
              ...current,
              edit: {
                ...current.edit,
                revision: saved?.revision ?? current.edit.revision,
              },
              dirty: hasNewEdits,
            };
          });
          setAutosave(hasNewEdits ? "idle" : "saved");
          void refreshWorkspace();
        })
        .catch((caught: unknown) => {
          if (!mounted.current) return;
          const code =
            caught instanceof Error ? caught.message : "AUTOSAVE_FAILED";
          setAutosave(
            caught instanceof WritingRequestError && caught.status === 409
              ? "conflict"
              : "error",
          );
          setError(readableError(code));
        });
    }, 800);
    return () => clearTimeout(timer);
  }, [
    autosave,
    blocks,
    blocksKey,
    busy,
    dirty,
    edit,
    selected,
    setDraft,
    state.episode.id,
    title,
    refreshWorkspace,
    writingRequest,
  ]);

  async function act(action: string, data: unknown) {
    setBusy(true);
    setError("");
    try {
      const result = await writingRequest(action, data);
      const next = "episode" in result ? result : await refresh();
      if (!mounted.current) return next;
      setState(next);
      if (["select", "checkpoint", "restore", "discard"].includes(action)) {
        setDraft(localDraftFromState(next));
        setAutosave(next.workingDraft ? "saved" : "idle");
        setConfirmDiscard(false);
      }
      if (action === "checkpoint")
        setVersionLabel(`Version ${next.scripts.length + 1}`);
      if (action === "generate") setGenerationInstructions("");
      void refreshWorkspace();
      return next;
    } catch (caught) {
      const code =
        caught instanceof Error ? caught.message : "REQUEST_FAILED";
      setError(readableError(code));
      return null;
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function prepareConflictOverwrite() {
    setBusy(true);
    setError("");
    try {
      const next = await refresh();
      if (!selected || next.selectedScriptId !== selected.id)
        throw new Error("SCRIPT_SELECTION_CHANGED");
      setDraft((current) =>
        current.edit
          ? {
              ...current,
              edit: {
                ...current.edit,
                revision:
                  next.workingDraft?.baseScriptId === selected.id
                    ? next.workingDraft.revision
                    : 0,
              },
              dirty: true,
            }
          : current,
      );
      setAutosave("idle");
    } catch (caught) {
      setError(
        readableError(
          caught instanceof Error ? caught.message : "REFRESH_FAILED",
        ),
      );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  const editionInfo = state.editions.find(
    (item) => item.id === (selected?.importId || edition),
  );
  const workingDraft = state.workingDraft;
  const historyBlocked =
    busy || dirty || autosave === "saving" || Boolean(workingDraft);

  return (
    <>
      <header className="workspace-section-heading script-heading">
        <div>
          <h2>Script & sources</h2>
          <p>Shape your reflection. Keep quotations and their context intact.</p>
        </div>
        <span className={`script-save-state ${autosave}`} role="status">
          {autosave === "saving"
            ? "Saving draft…"
            : autosave === "saved" && workingDraft
              ? "Working draft saved"
              : autosave === "conflict"
                ? "Save conflict"
                : autosave === "error"
                  ? "Draft not saved"
                  : "Version saved"}
        </span>
      </header>
      {error && (
        <div className="source-notice" role="alert">
          {error}
          {(autosave === "error" || autosave === "conflict") && (
            <button
              type="button"
              className="text-link"
              disabled={busy}
              onClick={() =>
                autosave === "conflict"
                  ? void prepareConflictOverwrite()
                  : setAutosave("idle")
              }
            >
              {autosave === "conflict"
                ? "Replace saved draft with these edits"
                : "Retry autosave"}
            </button>
          )}
        </div>
      )}
      <section className="panel writing-generation">
        <div className="writing-generation-fields">
          <label>
            Source edition
            <select
              value={edition}
              onChange={(event) => setEdition(event.target.value)}
            >
              {state.editions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.coverage}/114 chapters · {item.environment}
                </option>
              ))}
            </select>
          </label>
          <label>
            Direction for the next alternative
            <textarea
              value={generationInstructions}
              maxLength={2000}
              placeholder="For example: more reassuring, less formal, focus on patience."
              onChange={(event) =>
                setGenerationInstructions(event.target.value)
              }
            />
          </label>
        </div>
        <button
          className="button primary-action"
          disabled={
            busy || active || !edition || dirty || autosave === "saving"
          }
          onClick={() =>
            void act("generate", {
              importId: edition,
              episodeRevision: state.episode.revision,
              generationInstructions,
            })
          }
        >
          {active
            ? "Draft in progress…"
            : state.scripts.length
              ? "Generate another"
              : "Generate first draft"}
        </button>
        <button
          className="button"
          disabled={busy}
          onClick={() =>
            void refresh().catch((caught) => setError(String(caught)))
          }
        >
          <RefreshCw size={14} /> Refresh
        </button>
        <p>
          Uses {state.episode.llmModel}. A generated alternative is added to
          history and never replaces the selected version automatically.
        </p>
      </section>
      {state.jobs
        .filter((job) => job.kind === "draft")
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
          <section className="panel script-version-bar">
            <div>
              <span className="eyebrow">SELECTED VERSION</span>
              <strong>{selected.label}</strong>
              <small>
                {selected.changeKind.replaceAll("_", " ")} · {selected.model} ·{" "}
                {new Date(selected.createdAt).toLocaleString()}
              </small>
            </div>
            <label>
              Save working draft as
              <input
                value={versionLabel}
                maxLength={140}
                onChange={(event) => setVersionLabel(event.target.value)}
              />
            </label>
            <button
              className="button primary-action"
              disabled={
                busy ||
                dirty ||
                autosave === "saving" ||
                !workingDraft ||
                !versionLabel.trim()
              }
              onClick={() =>
                void act("checkpoint", {
                  revision: workingDraft?.revision,
                  selectionRevision: state.selectionRevision,
                  label: versionLabel,
                })
              }
            >
              Save named version
            </button>
          </section>
          {workingDraft && (
            <div className="source-notice script-draft-notice">
              <span>
                This working draft is autosaved. Save it as a named version or
                discard it before selecting history.
              </span>
              {!confirmDiscard ? (
                <button
                  type="button"
                  className="text-link"
                  onClick={() => setConfirmDiscard(true)}
                >
                  Discard working draft
                </button>
              ) : (
                <span className="inline-confirm">
                  Discard the autosaved draft?
                  <button
                    type="button"
                    className="text-link"
                    disabled={busy || dirty}
                    onClick={() =>
                      void act("discard", { revision: workingDraft.revision })
                    }
                  >
                    Yes, discard
                  </button>
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => setConfirmDiscard(false)}
                  >
                    Keep it
                  </button>
                </span>
              )}
            </div>
          )}
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
                  onChange={(event) => setTitle(event.target.value)}
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
                      onChange={(event) =>
                        setBlocks((items) =>
                          items.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  kind: "reflection",
                                  text: event.target.value,
                                }
                              : item,
                          ),
                        )
                      }
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
                  className="button"
                  disabled={
                    busy ||
                    dirty ||
                    autosave === "saving" ||
                    Boolean(workingDraft) ||
                    selected.reviewState === "reviewed" ||
                    selected.id !== state.selectedScriptId ||
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
                  Mark selected version reviewed
                </button>
              </div>
              <p className="writing-helper">
                Changes autosave as a working draft. A named version is an
                immutable checkpoint; review belongs to that exact version.
              </p>
            </section>
            <aside className="panel writing-context">
              <h2>Source context</h2>
              <p>
                Retrieved passages are candidates, not proof of interpretation.
                Read the surrounding verses before reviewing.
              </p>
              {selected.sources
                .filter((source) =>
                  blocks.some(
                    (block) =>
                      block.kind === "quote" && block.sourceId === source.id,
                  ),
                )
                .map((source) => (
                  <section key={source.id}>
                    <h3>Qur’an {source.reference}</h3>
                    <small>{source.edition}</small>
                    {source.context.map((context) => (
                      <p
                        key={context.reference}
                        translate="no"
                        className={
                          context.reference === source.reference
                            ? "context-focus"
                            : ""
                        }
                      >
                        <strong>{context.reference}</strong> {context.text}
                      </p>
                    ))}
                  </section>
                ))}
            </aside>
          </div>
          <section className="panel script-history">
            <div className="section-heading">
              <div>
                <span className="eyebrow">IMMUTABLE CHECKPOINTS</span>
                <h2>Version history</h2>
              </div>
              <span>{state.scripts.length} versions</span>
            </div>
            {historyBlocked && (
              <p className="muted">
                Finish autosaving, then save or discard the working draft to
                change the selected version.
              </p>
            )}
            <div className="script-history-list">
              {state.scripts.map((script) => {
                const current = script.id === state.selectedScriptId;
                return (
                  <article
                    key={script.id}
                    className={current ? "current" : ""}
                  >
                    <div>
                      <strong>{script.label}</strong>
                      {current && <span className="pill">Selected</span>}
                      <p>
                        {script.changeKind.replaceAll("_", " ")} · {script.model} ·{" "}
                        {new Date(script.createdAt).toLocaleString()}
                      </p>
                      {script.generationInstructions && (
                        <small>
                          Direction: {script.generationInstructions}
                        </small>
                      )}
                    </div>
                    <div className="script-history-actions">
                      <button
                        type="button"
                        className="text-link"
                        disabled={historyBlocked || current}
                        onClick={() =>
                          void act("select", {
                            scriptId: script.id,
                            selectionRevision: state.selectionRevision,
                          })
                        }
                      >
                        Use this version
                      </button>
                      <button
                        type="button"
                        className="text-link"
                        disabled={historyBlocked}
                        onClick={() =>
                          void act("restore", {
                            scriptId: script.id,
                            selectionRevision: state.selectionRevision,
                            label: `Restored ${script.label}`,
                          })
                        }
                      >
                        Restore as new
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}
    </>
  );
}
