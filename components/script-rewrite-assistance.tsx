"use client";

import { useCallback, useEffect, useState } from "react";
import { LLM_MODELS } from "@/lib/domain/episode";
import type { ReflectionSelection } from "@/lib/domain/script-rewrites";
import type { RewriteAssistanceState } from "@/lib/server/writing/rewrites";
import { useWorkspaceBuffer } from "./episode-workspace";
import styles from "./script-rewrite-assistance.module.css";

type Suggestion = RewriteAssistanceState["suggestions"][number];
export function ScriptRewriteAssistance({
  episodeId,
  episodeRevision,
  baseScriptId,
  draftRevision,
  selection,
  canGenerate,
  canApply,
  onApply,
  onDirtyChange,
}: {
  episodeId: string;
  episodeRevision: number;
  baseScriptId: string;
  draftRevision: number;
  selection: ReflectionSelection | null;
  canGenerate: boolean;
  canApply: boolean;
  onApply: (suggestion: Suggestion, replacement: string) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [state, setState] = useState<RewriteAssistanceState>({
    suggestions: [],
    jobs: [],
  });
  const [instructions, setInstructions] = useWorkspaceBuffer(
    `rewrites:instructions:${episodeId}`,
    "",
  );
  const [model, setModel] = useWorkspaceBuffer<(typeof LLM_MODELS)[number]>(
    `rewrites:model:${episodeId}`,
    LLM_MODELS[0],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const refresh = useCallback(async () => {
    const response = await fetch(`/api/episodes/${episodeId}/rewrites`);
    if (!response.ok)
      throw new Error(
        "Rewrite history is temporarily unavailable. Your script is preserved.",
      );
    setState(await response.json());
  }, [episodeId]);
  useEffect(() => {
    onDirtyChange(Boolean(instructions.trim()));
  }, [instructions, onDirtyChange]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh().catch((caught: Error) => setError(caught.message));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  const active = state.jobs.some((job) =>
    ["queued", "running"].includes(job.status),
  );
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      void refresh().catch((caught: Error) => setError(caught.message));
    }, 2000);
    return () => window.clearInterval(timer);
  }, [active, refresh]);
  async function act(action: "generate" | "reject" | "retry", data: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/episodes/${episodeId}/rewrites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, data }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error || "Rewrite request failed. Your script is preserved.",
        );
      if (action === "generate") {
        setInstructions("");
        setNotice(
          "Request saved. The worker will add alternatives; you can keep editing.",
        );
      }
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Rewrite assistance unavailable",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className={`panel ${styles.panel}`}
      aria-label="Targeted reflection rewrites"
    >
      <div>
        <div className="eyebrow">REFLECTION ALTERNATIVES</div>
        <h2>Rewrite selected words</h2>
      </div>
      <p>
        Select a sentence or paragraph in a reflection, or choose its whole
        block. Each request keeps the original and three alternatives until you
        explicitly apply one.
      </p>
      {selection ? (
        <blockquote className={styles.original}>{selection.text}</blockquote>
      ) : (
        <p role="status">Select reflection text above to begin.</p>
      )}
      <div className={styles.controls}>
        <label>
          Model for this request
          <select
            value={model}
            onChange={(event) => setModel(event.target.value as typeof model)}
          >
            {LLM_MODELS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          Rewrite instructions
          <textarea
            value={instructions}
            maxLength={2000}
            rows={3}
            placeholder="Shorter, gentler, simpler, or a specific direction…"
            onChange={(event) => setInstructions(event.target.value)}
          />
        </label>
      </div>
      <div className={styles.actions}>
        {["Shorten", "Simplify", "More reassuring"].map((direction) => (
          <button
            key={direction}
            type="button"
            className="text-link"
            onClick={() => setInstructions(direction)}
          >
            {direction}
          </button>
        ))}
        <button
          type="button"
          className="button"
          disabled={busy || !selection || !canGenerate}
          onClick={() =>
            selection &&
            void act("generate", {
              baseScriptId,
              draftRevision,
              episodeRevision,
              model,
              instructions,
              selection,
            })
          }
        >
          Generate three alternatives
        </button>
      </div>
      {selection && !canGenerate && (
        <p role="status">
          Finish and autosave your latest edits before requesting alternatives.
        </p>
      )}
      {error && (
        <p role="alert" className="source-notice">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {state.jobs
        .filter((job) => job.status !== "succeeded")
        .map((job) => (
          <div key={job.id} className="source-notice" role="status">
            <p>
              {job.progress}
              {job.error ? ` · ${job.error.replaceAll("_", " ")}` : ""}
            </p>
            {job.status === "failed" && (
              <button
                className="button"
                disabled={busy}
                onClick={() => void act("retry", { jobId: job.id })}
              >
                Retry interrupted request
              </button>
            )}
            {job.status === "needs_attention" && (
              <p>
                This provider result needs reconciliation before another
                dispatch.
              </p>
            )}
          </div>
        ))}
      <details open={state.suggestions.length > 0}>
        <summary>Retained requests ({state.suggestions.length})</summary>
        {state.suggestions.map((suggestion) => (
          <article key={suggestion.id} className={styles.request}>
            <div className={styles.actions}>
              <strong>{suggestion.model}</strong>
              <time dateTime={suggestion.createdAt}>
                {new Date(suggestion.createdAt).toLocaleString()}
              </time>
              {suggestion.rejected ? (
                <span>Rejected · retained for reference</span>
              ) : (
                <button
                  className="text-link"
                  disabled={busy}
                  onClick={() =>
                    void act("reject", { suggestionId: suggestion.id })
                  }
                >
                  Reject this set
                </button>
              )}
            </div>
            {suggestion.instructions && (
              <p>Direction: {suggestion.instructions}</p>
            )}
            <div className={styles.comparison}>
              <div>
                <h3>Original selection</h3>
                <p className={styles.original}>{suggestion.selection.text}</p>
              </div>
              <div>
                <h3>Alternatives</h3>
                {suggestion.alternatives.map((alternative, index) => (
                  <div key={index} className={styles.alternative}>
                    <p>{alternative.text}</p>
                    <small>{alternative.reason}</small>
                    <button
                      type="button"
                      className="button"
                      disabled={
                        busy ||
                        !canApply ||
                        suggestion.rejected ||
                        suggestion.baseScriptId !== baseScriptId
                      }
                      onClick={() => {
                        setError("");
                        setNotice("");
                        try {
                          onApply(suggestion, alternative.text);
                          setNotice(
                            "Applied to the working draft. Autosave and undo use the existing script controls.",
                          );
                        } catch (caught) {
                          setError(
                            caught instanceof Error
                              ? caught.message
                              : "The target changed. Review current words before applying.",
                          );
                        }
                      }}
                    >
                      Apply alternative {index + 1}
                    </button>
                  </div>
                ))}
              </div>
            </div>
            {suggestion.baseScriptId !== baseScriptId && (
              <p>
                This request belongs to another saved version. Comparison
                remains available.
              </p>
            )}
          </article>
        ))}
      </details>
    </section>
  );
}
