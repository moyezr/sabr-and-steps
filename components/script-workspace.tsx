"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Plus,
  Redo2,
  RefreshCw,
  Trash2,
  Undo2,
} from "lucide-react";
import { ScriptSourceBrowser } from "./script-source-browser";
import { HadithSourceBrowser } from "./hadith-source-browser";
import { ScriptRewriteAssistance } from "./script-rewrite-assistance";
import {
  applyReflectionRewrite,
  type ReflectionSelection,
} from "@/lib/domain/script-rewrites";
import {
  useEpisodeWorkspace,
  useWorkspaceBuffer,
  useWorkspaceDraft,
} from "./episode-workspace";
import type { WritingState } from "@/lib/server/writing/state";
import { narrationText, type ScriptBlock } from "@/lib/domain/script";
import {
  compareScriptBlocks,
  createScriptEditHistory,
  recordScriptEdit,
  redoScriptEdit,
  syncScriptEditHistory,
  undoScriptEdit,
  type ScriptEditHistory,
} from "@/lib/domain/script-editing";

type LocalDraft = {
  selectedId: string;
  edit: {
    baseScriptId: string;
    blocks: ScriptBlock[];
    title: string;
    revision: number;
  } | null;
  dirty: boolean;
  history: ScriptEditHistory | null;
};

type ComparisonChoice = { leftId: string; rightId: string };

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
  const selected = state.scripts.find((script) => script.id === selectedId);
  const working = state.workingDraft;
  const edit =
    working?.baseScriptId === selectedId
      ? {
          baseScriptId: selectedId,
          blocks: working.blocks,
          title: working.title,
          revision: working.revision,
        }
      : null;
  return {
    selectedId,
    edit,
    dirty: false,
    history: selected
      ? createScriptEditHistory(selectedId, edit?.revision ?? 0, {
          title: edit?.title ?? selected.title,
          blocks: edit?.blocks ?? selected.blocks,
        })
      : null,
  };
}

function comparisonChoiceFromState(state: WritingState): ComparisonChoice {
  const rightId = state.selectedScriptId || state.scripts[0]?.id || "";
  const leftId =
    state.scripts.find((script) => script.id !== rightId)?.id || rightId;
  return { leftId, rightId };
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
  if (code === "SCRIPT_ALREADY_EXISTS")
    return "A script was started elsewhere. Your manual words are still here; refresh to inspect the saved version.";
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
  const [comparison, setComparison] = useWorkspaceBuffer<ComparisonChoice>(
    `script:comparison:${initial.episode.id}`,
    comparisonChoiceFromState(initial),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [autosave, setAutosave] = useState<AutosaveState>(
    initial.workingDraft ? "saved" : "idle",
  );
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [manualTitle, setManualTitle] = useWorkspaceBuffer(
    `script:manual-title:${initial.episode.id}`,
    initial.episode.title,
  );
  const [manualText, setManualText] = useWorkspaceBuffer(
    `script:manual-text:${initial.episode.id}`,
    "",
  );
  const [insertAfter, setInsertAfter] = useState<number | null>(null);
  const [replacement, setReplacement] = useState<{
    index: number;
    reference: string;
  } | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [rewriteSelection, setRewriteSelection] =
    useWorkspaceBuffer<ReflectionSelection | null>(
      `script:rewrite-selection:${initial.episode.id}`,
      null,
    );
  const [rewritePromptDirty, setRewritePromptDirty] = useState(false);
  const sourcesAside = useRef<HTMLElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reconciled = useRef(false);
  useEffect(() => {
    if (reconciled.current) return;
    reconciled.current = true;
    const serverDraft = initial.workingDraft;
    if (!serverDraft) return;
    let conflict = false;
    setDraft((current) => {
      if (
        !current.edit ||
        current.edit.baseScriptId !== serverDraft.baseScriptId ||
        current.edit.revision >= serverDraft.revision
      )
        return current;
      const sameContent =
        current.edit.title === serverDraft.title &&
        JSON.stringify(current.edit.blocks) ===
          JSON.stringify(serverDraft.blocks);
      if (!sameContent) {
        conflict = true;
        return { ...current, dirty: true };
      }
      return {
        ...current,
        edit: { ...current.edit, revision: serverDraft.revision },
        dirty: false,
        history: current.history
          ? syncScriptEditHistory(
              current.history,
              serverDraft.baseScriptId,
              serverDraft.revision,
              current.history.present,
            )
          : current.history,
      };
    });
    if (conflict) {
      const timer = window.setTimeout(() => {
        setAutosave("conflict");
        setError(readableError("SCRIPT_DRAFT_CONFLICT"));
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [initial.workingDraft, setDraft]);

  const { selectedId, edit, dirty, history } = draft;
  const selected =
    state.scripts.find((script) => script.id === selectedId) ||
    state.scripts.find((script) => script.id === state.selectedScriptId) ||
    state.scripts[0];
  const blocks = useMemo(
    () =>
      edit && selected && edit.baseScriptId === selected.id
        ? edit.blocks
        : selected?.blocks || [],
    [edit, selected],
  );
  const title =
    edit && selected && edit.baseScriptId === selected.id
      ? edit.title
      : selected?.title || "";
  const blocksKey = JSON.stringify(blocks);
  const validEdit =
    title.trim().length > 0 &&
    blocks.length > 0 &&
    blocks.length <= 30 &&
    blocks.every((block) => block.text.trim().length > 0);
  const active = state.jobs.some(
    (job) => job.kind === "draft" && ["queued", "running"].includes(job.status),
  );
  const promptDirty =
    edition !== initialEdition || generationInstructions.trim().length > 0;
  const manualDirty =
    !selected && (manualText.length > 0 || manualTitle !== state.episode.title);
  useWorkspaceDraft({
    dirty:
      dirty ||
      autosave === "error" ||
      autosave === "conflict" ||
      promptDirty ||
      rewritePromptDirty ||
      manualDirty,
    saving: busy || autosave === "saving",
  });

  function beginEdit(nextTitle: string, nextBlocks: ScriptBlock[]) {
    if (!selected) return;
    setDraft((current) => {
      const revision =
        current.edit?.baseScriptId === selected.id
          ? current.edit.revision
          : state.workingDraft?.baseScriptId === selected.id
            ? state.workingDraft.revision
            : 0;
      const previous = {
        title:
          current.edit?.baseScriptId === selected.id
            ? current.edit.title
            : selected.title,
        blocks:
          current.edit?.baseScriptId === selected.id
            ? current.edit.blocks
            : selected.blocks,
      };
      const currentHistory = current.history
        ? syncScriptEditHistory(
            current.history,
            selected.id,
            revision,
            previous,
          )
        : createScriptEditHistory(selected.id, revision, previous);
      return {
        selectedId: selected.id,
        edit: {
          baseScriptId: selected.id,
          blocks: nextBlocks,
          title: nextTitle,
          revision,
        },
        dirty: true,
        history: recordScriptEdit(currentHistory, {
          title: nextTitle,
          blocks: nextBlocks,
        }),
      };
    });
    setAutosave((current) =>
      current === "saving" || current === "conflict" ? current : "idle",
    );
    if (autosave !== "conflict") setError("");
  }

  function setBlocks(update: (items: ScriptBlock[]) => ScriptBlock[]) {
    setReplacement(null);
    beginEdit(title, update(blocks));
  }

  function insertBlock(block: ScriptBlock) {
    if (busy || blocks.length >= 30) return;
    const position =
      insertAfter === null
        ? blocks.length
        : Math.min(insertAfter + 1, blocks.length);
    setBlocks((items) => [
      ...items.slice(0, position),
      block,
      ...items.slice(position),
    ]);
    setInsertAfter(position);
  }

  function openSources() {
    setSourcesOpen(true);
    window.requestAnimationFrame(() =>
      sourcesAside.current?.scrollIntoView({
        block: "start",
        behavior: "smooth",
      }),
    );
  }

  function moveBlock(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (busy || target < 0 || target >= blocks.length) return;
    setBlocks((items) => {
      const next = [...items];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setInsertAfter(null);
  }

  function removeBlock(index: number) {
    if (busy || blocks.length <= 1) return;
    setBlocks((items) => items.filter((_, itemIndex) => itemIndex !== index));
    setInsertAfter(null);
  }

  function setTitle(value: string) {
    beginEdit(value, blocks);
  }

  const moveHistory = useCallback(
    (direction: "undo" | "redo") => {
      if (busy) return;
      setReplacement(null);
      setInsertAfter(null);
      let changed = false;
      setDraft((current) => {
        if (!current.history) return current;
        const nextHistory =
          direction === "undo"
            ? undoScriptEdit(current.history)
            : redoScriptEdit(current.history);
        if (nextHistory === current.history) return current;
        changed = true;
        return {
          ...current,
          edit: {
            baseScriptId: nextHistory.baseScriptId,
            title: nextHistory.present.title,
            blocks: nextHistory.present.blocks,
            revision: Math.max(
              current.edit?.revision ?? 0,
              nextHistory.revision,
            ),
          },
          dirty: true,
          history: nextHistory,
        };
      });
      if (!changed) return;
      setAutosave((current) =>
        ["saving", "error", "conflict"].includes(current) ? current : "idle",
      );
    },
    [busy, setDraft],
  );

  useEffect(() => {
    function handleHistoryShortcut(event: KeyboardEvent) {
      if (
        event.isComposing ||
        event.altKey ||
        (!event.metaKey && !event.ctrlKey)
      )
        return;
      const target = event.target;
      if (
        !(target instanceof Element) ||
        !target.closest("[data-script-edit-field]")
      )
        return;
      const key = event.key.toLowerCase();
      const redo =
        (key === "z" && event.shiftKey) ||
        (key === "y" && event.ctrlKey && !event.metaKey);
      if (key !== "z" && !redo) return;
      event.preventDefault();
      moveHistory(redo ? "redo" : "undo");
    }
    window.addEventListener("keydown", handleHistoryShortcut);
    return () => window.removeEventListener("keydown", handleHistoryShortcut);
  }, [moveHistory]);

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
            !next.jobs.some((job) => ["queued", "running"].includes(job.status))
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
      !validEdit ||
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
              history:
                saved && current.history
                  ? syncScriptEditHistory(
                      current.history,
                      snapshot.baseScriptId,
                      saved.revision,
                      current.history.present,
                    )
                  : current.history,
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
    validEdit,
  ]);

  async function act(action: string, data: unknown) {
    setBusy(true);
    setError("");
    try {
      const result = await writingRequest(action, data);
      const next = "episode" in result ? result : await refresh();
      if (!mounted.current) return next;
      setState(next);
      if (
        ["start", "select", "checkpoint", "restore", "discard"].includes(action)
      ) {
        setDraft(localDraftFromState(next));
        setAutosave(next.workingDraft ? "saved" : "idle");
        setConfirmDiscard(false);
        setReplacement(null);
        setInsertAfter(null);
      }
      if (action === "start") setManualText("");
      if (action === "checkpoint" || action === "start")
        setVersionLabel(`Version ${next.scripts.length + 1}`);
      if (action === "generate") setGenerationInstructions("");
      void refreshWorkspace();
      return next;
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "REQUEST_FAILED";
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
              history:
                current.history &&
                next.workingDraft?.baseScriptId === selected.id
                  ? syncScriptEditHistory(
                      current.history,
                      selected.id,
                      next.workingDraft.revision,
                      current.history.present,
                    )
                  : current.history,
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
  const comparisonFallback = comparisonChoiceFromState(state);
  const comparisonLeft =
    state.scripts.find((script) => script.id === comparison.leftId) ||
    state.scripts.find((script) => script.id === comparisonFallback.leftId);
  const comparisonRight =
    state.scripts.find((script) => script.id === comparison.rightId) ||
    state.scripts.find((script) => script.id === comparisonFallback.rightId);
  const comparisonRows = useMemo(() => {
    if (
      !comparisonLeft ||
      !comparisonRight ||
      !Array.isArray(comparisonLeft.blocks) ||
      !Array.isArray(comparisonRight.blocks)
    )
      return [];
    return compareScriptBlocks(comparisonLeft.blocks, comparisonRight.blocks);
  }, [comparisonLeft, comparisonRight]);

  return (
    <>
      <header className="workspace-section-heading script-heading">
        <div>
          <h2>Script & sources</h2>
          <p>
            Shape your reflection. Keep quotations and their context intact.
          </p>
        </div>
        <div className="script-heading-actions">
          <div className="script-undo-controls" aria-label="Edit history">
            <button
              type="button"
              className="text-link"
              disabled={busy || !history?.past.length}
              aria-keyshortcuts="Control+Z Meta+Z"
              title="Undo script edit (Ctrl/Cmd+Z)"
              onClick={() => moveHistory("undo")}
            >
              <Undo2 size={14} /> Undo
            </button>
            <button
              type="button"
              className="text-link"
              disabled={busy || !history?.future.length}
              aria-keyshortcuts="Control+Y Control+Shift+Z Meta+Shift+Z"
              title="Redo script edit (Ctrl+Y or Ctrl/Cmd+Shift+Z)"
              onClick={() => moveHistory("redo")}
            >
              <Redo2 size={14} /> Redo
            </button>
          </div>
          <span className={`script-save-state ${autosave}`} role="status">
            {dirty &&
            autosave !== "saving" &&
            autosave !== "conflict" &&
            autosave !== "error"
              ? "Unsaved changes"
              : autosave === "saving"
                ? "Saving draft…"
                : autosave === "saved" && workingDraft
                  ? "Working draft saved"
                  : autosave === "conflict"
                    ? "Save conflict"
                    : autosave === "error"
                      ? "Draft not saved"
                      : selected
                        ? "Version saved"
                        : "No script yet"}
          </span>
        </div>
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
                  {item.name} · {item.coverage}/114 chapters ·{" "}
                  {item.environment}
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
            busy ||
            active ||
            !edition ||
            dirty ||
            manualDirty ||
            autosave === "saving"
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
          {manualDirty &&
            " Start your manual script or clear the manual form before generating."}
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
        <section className="panel script-manual-start">
          <BookOpen />
          <h2>Write your first draft</h2>
          <p>
            Start with your own words, then add reflections and canonical
            passages. Choose a source edition above for passages you may insert.
            Starting manually uses no model credits.
          </p>
          <label>
            Manual script title
            <input
              value={manualTitle}
              maxLength={140}
              disabled={busy || active}
              onChange={(event) => setManualTitle(event.target.value)}
            />
          </label>
          <label>
            Opening reflection
            <textarea
              value={manualText}
              maxLength={2200}
              rows={4}
              disabled={busy || active}
              onChange={(event) => setManualText(event.target.value)}
            />
          </label>
          {!edition && (
            <p className="source-notice">
              Import a source edition before starting a script.
            </p>
          )}
          <button
            type="button"
            className="button primary-action"
            disabled={
              busy ||
              active ||
              !edition ||
              !manualTitle.trim() ||
              !manualText.trim()
            }
            onClick={() =>
              void act("start", {
                importId: edition,
                episodeRevision: state.episode.revision,
                title: manualTitle,
                text: manualText,
              })
            }
          >
            Start manual script
          </button>
          {manualDirty && (
            <button
              type="button"
              className="text-link"
              disabled={busy || active}
              onClick={() => {
                setManualTitle(state.episode.title);
                setManualText("");
              }}
            >
              Clear manual form
            </button>
          )}
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
            {selected.episodeRevision !==
            (state.episode.contentRevision ?? state.episode.revision)
              ? "This script was created for an older episode brief."
              : ""}
          </p>
          <div className="writing-columns">
            <section className="panel writing-editor">
              <label className="writing-title">
                Working title
                <input
                  data-script-edit-field
                  value={title}
                  maxLength={140}
                  disabled={busy}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <div className="script-block-toolbar">
                <label>
                  Insert new block
                  <select
                    value={insertAfter === null ? "end" : String(insertAfter)}
                    disabled={busy}
                    onChange={(event) =>
                      setInsertAfter(
                        event.target.value === "end"
                          ? null
                          : Number(event.target.value),
                      )
                    }
                  >
                    <option value="end">At the end</option>
                    <option value="-1">At the beginning</option>
                    {blocks.map((_, index) => (
                      <option key={index} value={index}>
                        After block {index + 1}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="button"
                  disabled={busy || blocks.length >= 30}
                  onClick={() => insertBlock({ kind: "reflection", text: "" })}
                >
                  <Plus size={14} /> Add reflection
                </button>
                <button
                  type="button"
                  className="text-link"
                  disabled={busy || blocks.length >= 30}
                  onClick={openSources}
                >
                  <BookOpen size={14} /> Find a quotation
                </button>
                <span>{blocks.length}/30 blocks</span>
              </div>
              {!validEdit && (
                <p className="source-notice" role="status">
                  Add a title and finish empty reflections, or remove them, to
                  resume autosaving.
                </p>
              )}
              {blocks.map((block, index) => (
                <div
                  key={`${selected.id}-${index}`}
                  className={`script-block ${block.kind}`}
                >
                  <div className="script-block-header">
                    <div className="eyebrow">
                      <span className="script-block-number">{index + 1}. </span>
                      {block.kind === "quote"
                        ? `${block.sourceKind === "hadith" ? "HADITH" : "QUR’AN"} ${block.reference} · CANONICAL TRANSLATION`
                        : "ORIGINAL REFLECTION"}
                    </div>
                    <div className="script-block-actions">
                      <button
                        type="button"
                        className="text-link"
                        aria-label={`Move block ${index + 1} up`}
                        disabled={busy || index === 0}
                        onClick={() => moveBlock(index, -1)}
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        type="button"
                        className="text-link"
                        aria-label={`Move block ${index + 1} down`}
                        disabled={busy || index === blocks.length - 1}
                        onClick={() => moveBlock(index, 1)}
                      >
                        <ArrowDown size={15} />
                      </button>
                      <button
                        type="button"
                        className="text-link"
                        aria-label={`Remove block ${index + 1}`}
                        disabled={busy || blocks.length === 1}
                        onClick={() => removeBlock(index)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  {block.kind === "quote" ? (
                    <>
                      <p translate="no">{block.text}</p>
                      <small>{block.edition}</small>
                      <button
                        type="button"
                        className="text-link"
                        disabled={busy}
                        onClick={() => {
                          setReplacement({ index, reference: block.reference });
                          openSources();
                        }}
                      >
                        Replace quotation
                      </button>
                    </>
                  ) : (
                    <>
                      <textarea
                        data-script-edit-field
                        aria-label={`Reflection ${index + 1}`}
                        value={block.text}
                        maxLength={2200}
                        disabled={busy}
                        rows={Math.max(3, Math.ceil(block.text.length / 70))}
                        onSelect={(event) => {
                          const { selectionStart: start, selectionEnd: end } =
                            event.currentTarget;
                          if (
                            end > start &&
                            block.text.slice(start, end).trim()
                          )
                            setRewriteSelection({
                              blockIndex: index,
                              blockText: block.text,
                              start,
                              end,
                              text: block.text.slice(start, end),
                            });
                        }}
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
                      <button
                        type="button"
                        className="text-link"
                        disabled={busy || !block.text.trim()}
                        onClick={() =>
                          setRewriteSelection({
                            blockIndex: index,
                            blockText: block.text,
                            start: 0,
                            end: block.text.length,
                            text: block.text,
                          })
                        }
                      >
                        Rewrite this reflection
                      </button>
                    </>
                  )}
                </div>
              ))}
              <div className="writing-actions">
                <span>
                  {narrationText(blocks).split(/\s+/).filter(Boolean).length}{" "}
                  spoken words ·{" "}
                  {dirty || workingDraft
                    ? "unreviewed working draft"
                    : selected.reviewState}
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
                    selected.episodeRevision !==
                      (state.episode.contentRevision ?? state.episode.revision)
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
              <ScriptRewriteAssistance
                episodeId={state.episode.id}
                episodeRevision={state.episode.revision}
                baseScriptId={selected.id}
                draftRevision={edit?.revision ?? 0}
                selection={rewriteSelection}
                canGenerate={
                  !busy &&
                  !dirty &&
                  validEdit &&
                  autosave !== "saving" &&
                  autosave !== "conflict" &&
                  autosave !== "error"
                }
                canApply={
                  !busy && autosave !== "conflict" && autosave !== "error"
                }
                onDirtyChange={setRewritePromptDirty}
                onApply={(suggestion, text) => {
                  if (suggestion.baseScriptId !== selected.id)
                    throw new Error(
                      "Select the original saved version before applying this request.",
                    );
                  try {
                    setBlocks((items) =>
                      applyReflectionRewrite(items, suggestion.selection, text),
                    );
                  } catch (caught) {
                    throw new Error(
                      caught instanceof Error &&
                      caught.message === "REWRITE_BLOCK_TOO_LONG"
                        ? "The accepted result would exceed this reflection's 2,200-character limit."
                        : "The selected words changed after this request. Your later edits are preserved; request fresh alternatives.",
                    );
                  }
                }}
              />
            </section>
            <aside ref={sourcesAside} className="panel writing-context">
              <details
                className="script-source-drawer"
                open={sourcesOpen}
                onToggle={(event) => setSourcesOpen(event.currentTarget.open)}
              >
                <summary>Find and insert a passage</summary>
                <ScriptSourceBrowser
                  episodeId={state.episode.id}
                  importId={selected.importId}
                  canInsert={
                    !busy && (replacement !== null || blocks.length < 30)
                  }
                  replacement={replacement}
                  onInsert={insertBlock}
                  onReplace={(block) => {
                    if (
                      !replacement ||
                      busy ||
                      blocks[replacement.index]?.kind !== "quote"
                    )
                      return;
                    const index = replacement.index;
                    setBlocks((items) =>
                      items.map((item, itemIndex) =>
                        itemIndex === index ? block : item,
                      ),
                    );
                  }}
                  onCancelReplace={() => setReplacement(null)}
                />
                <details>
                  <summary>Inspect and insert a hadith report</summary>
                  <HadithSourceBrowser
                    episodeId={state.episode.id}
                    canInsert={
                      !busy && (replacement !== null || blocks.length < 30)
                    }
                    replacement={replacement}
                    onInsert={insertBlock}
                    onReplace={(block) => {
                      if (
                        !replacement ||
                        busy ||
                        blocks[replacement.index]?.kind !== "quote"
                      )
                        return;
                      const index = replacement.index;
                      setBlocks((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index ? block : item,
                        ),
                      );
                    }}
                    onCancelReplace={() => setReplacement(null)}
                  />
                </details>
              </details>
              <h2>Source context</h2>
              <p>
                Retrieved passages are candidates, not proof of interpretation.
                Read neighboring verses or the supplied report context before
                reviewing.
              </p>
              {(workingDraft ? state.workingSources : selected.sources)
                .filter((source) =>
                  blocks.some(
                    (block) =>
                      block.kind === "quote" && block.sourceId === source.id,
                  ),
                )
                .map((source) => (
                  <section key={source.id}>
                    <h3>
                      {source.sourceKind === "hadith" ? "Hadith" : "Qur’an"}{" "}
                      {source.reference}
                    </h3>
                    <small>{source.edition}</small>
                    {source.sourceKind === "hadith" && (
                      <>
                        <p>
                          {source.collection} · {source.book} ·{" "}
                          {source.numberingScheme}
                        </p>
                        {source.narrator && <p>Narrator: {source.narrator}</p>}
                        {source.grades?.map((grade, gradeIndex) => (
                          <p key={gradeIndex}>
                            Supplied grade: {grade.grade}
                            {grade.authority
                              ? ` · ${grade.authority}`
                              : " · Authority not supplied"}
                          </p>
                        ))}
                        {source.sourceUrl && (
                          <a
                            className="text-link"
                            href={source.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Canonical report source
                          </a>
                        )}
                        <p>
                          Publication reuse:{" "}
                          {source.rightsStatus === "cleared"
                            ? "cleared for this edition"
                            : "not cleared"}
                        </p>
                      </>
                    )}
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
          {comparisonLeft && comparisonRight && (
            <section className="panel script-comparison">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">IMMUTABLE CHECKPOINTS</span>
                  <h2>Compare versions</h2>
                </div>
                <span>{comparisonRows.length} aligned blocks</span>
              </div>
              <p className="muted">
                Compare two saved versions without changing the selected
                version. The autosaved working draft is intentionally excluded.
              </p>
              <div className="script-comparison-selectors">
                <label>
                  Version A
                  <select
                    value={comparisonLeft.id}
                    onChange={(event) =>
                      setComparison((current) => ({
                        ...current,
                        leftId: event.target.value,
                      }))
                    }
                  >
                    {state.scripts.map((script) => (
                      <option key={script.id} value={script.id}>
                        {script.label} ·{" "}
                        {script.changeKind.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                  <small>
                    {comparisonLeft.model} ·{" "}
                    {new Date(comparisonLeft.createdAt).toLocaleString()}
                  </small>
                </label>
                <label>
                  Version B
                  <select
                    value={comparisonRight.id}
                    onChange={(event) =>
                      setComparison((current) => ({
                        ...current,
                        rightId: event.target.value,
                      }))
                    }
                  >
                    {state.scripts.map((script) => (
                      <option key={script.id} value={script.id}>
                        {script.label} ·{" "}
                        {script.changeKind.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                  <small>
                    {comparisonRight.model} ·{" "}
                    {new Date(comparisonRight.createdAt).toLocaleString()}
                  </small>
                </label>
              </div>
              <div
                className={`script-comparison-title ${
                  comparisonLeft.title === comparisonRight.title
                    ? "unchanged"
                    : "changed"
                }`}
              >
                <span className="script-comparison-status">
                  {comparisonLeft.title === comparisonRight.title
                    ? "Unchanged title"
                    : "Changed title"}
                </span>
                <div>
                  <small>Version A title</small>
                  <strong>{comparisonLeft.title}</strong>
                </div>
                <div>
                  <small>Version B title</small>
                  <strong>{comparisonRight.title}</strong>
                </div>
              </div>
              <div className="script-comparison-rows">
                {comparisonRows.map((row) => (
                  <article
                    className={`script-comparison-row ${row.status}`}
                    key={`${row.status}-${row.leftIndex ?? "x"}-${row.rightIndex ?? "x"}`}
                  >
                    <span className="script-comparison-status">
                      {row.status === "added"
                        ? "Added in B"
                        : row.status === "removed"
                          ? "Removed from B"
                          : row.status === "changed"
                            ? "Changed"
                            : "Unchanged"}
                    </span>
                    {[row.left, row.right].map((block, side) => (
                      <div
                        className={`script-comparison-cell ${
                          block ? "" : "empty"
                        }`}
                        key={side}
                      >
                        <small>{side === 0 ? "Version A" : "Version B"}</small>
                        {block ? (
                          <>
                            <span className="eyebrow">
                              {block.kind === "quote"
                                ? `QUR’AN ${block.reference}`
                                : "ORIGINAL REFLECTION"}
                            </span>
                            <p
                              translate={
                                block.kind === "quote" ? "no" : undefined
                              }
                            >
                              {block.text}
                            </p>
                            {block.kind === "quote" && (
                              <small>{block.edition}</small>
                            )}
                          </>
                        ) : (
                          <p>No corresponding block.</p>
                        )}
                      </div>
                    ))}
                  </article>
                ))}
              </div>
            </section>
          )}
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
                  <article key={script.id} className={current ? "current" : ""}>
                    <div>
                      <strong>{script.label}</strong>
                      {current && <span className="pill">Selected</span>}
                      <p>
                        {script.changeKind.replaceAll("_", " ")} ·{" "}
                        {script.model} ·{" "}
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
