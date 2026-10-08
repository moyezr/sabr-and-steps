"use client";

import { useEffect, useState } from "react";
import type { MediaState } from "@/lib/server/media/state";
import {
  EMPTY_REVIEW_CHECKLIST,
  missingReviewChecks,
  type ExportFormat,
  type ReviewChecklist,
} from "@/lib/domain/export-review";
import { useWorkspaceBuffer } from "./episode-workspace";

type Props = {
  state: MediaState;
  busy: boolean;
  dirty: boolean;
  onAction: (action: string, data: unknown) => Promise<unknown>;
  onDirtyChange?: (dirty: boolean) => void;
};
const checks: [keyof ReviewChecklist, string][] = [
  ["sourceContext", "I checked canonical sources and surrounding context."],
  [
    "wording",
    "I reviewed reflections, quotations, and the practical takeaway.",
  ],
  ["pronunciation", "I listened to the narration and checked pronunciation."],
  ["captions", "I checked caption wording, breaks, and timing."],
  [
    "visuals",
    "I checked readability, source attribution, framing, and transitions.",
  ],
  [
    "audio",
    "I checked music, narration balance, fades, or intentional silence.",
  ],
  [
    "completePlayback",
    "I watched the complete exported video in every rendered format.",
  ],
  ["attribution", "I reviewed the source description and media attribution."],
];

export function ExportsPanel(props: Props) {
  return (
    <ExportControls
      key={props.state.selectedCompositionId || "empty"}
      {...props}
    />
  );
}
function ExportControls({
  state,
  busy,
  dirty,
  onAction,
  onDirtyChange,
}: Props) {
  const composition = state.compositions.find(
    (entry) => entry.id === state.selectedCompositionId,
  );
  const exports = state.exports.filter(
    (entry) => entry.compositionId === composition?.id,
  );
  const [reviewExportId, setReviewExportId] = useState(exports[0]?.id || "");
  const output =
    exports.find((entry) => entry.id === reviewExportId) || exports[0];
  const [format, setFormat] = useWorkspaceBuffer<ExportFormat>(
    `exports:format:${state.episode.id}`,
    state.episode.format,
  );
  const key = `exports:review:${state.episode.id}:${composition?.id || "empty"}:drafts`;
  type ReviewDraft = {
    checklist: ReviewChecklist;
    feedback: string;
    mediaRightsConfirmed: boolean;
    mediaRightsNotes: string;
  };
  const [reviewDrafts, setReviewDrafts] = useWorkspaceBuffer<
    Record<string, ReviewDraft>
  >(key, {});
  const latestReview = state.reviews.find(
    (review) =>
      review.compositionId === composition?.id &&
      review.exportId === output?.id,
  );
  const draftKey = output?.id || "empty";
  const currentDraft = reviewDrafts[draftKey] || {
    checklist: latestReview?.checklist || EMPTY_REVIEW_CHECKLIST,
    feedback: latestReview?.feedback || "",
    mediaRightsConfirmed: latestReview?.mediaRightsConfirmed || false,
    mediaRightsNotes: latestReview?.mediaRightsNotes || "",
  };
  const { checklist, feedback, mediaRightsConfirmed, mediaRightsNotes } =
    currentDraft;
  function updateReview(patch: Partial<ReviewDraft>) {
    setReviewDrafts((previous) => ({
      ...previous,
      [draftKey]: { ...currentDraft, ...previous[draftKey], ...patch },
    }));
  }
  const setChecklist = (
    value: ReviewChecklist | ((current: ReviewChecklist) => ReviewChecklist),
  ) =>
    setReviewDrafts((previous) => {
      const draft = previous[draftKey] || currentDraft;
      return {
        ...previous,
        [draftKey]: {
          ...draft,
          checklist:
            typeof value === "function" ? value(draft.checklist) : value,
        },
      };
    });
  const setFeedback = (value: string) => updateReview({ feedback: value });
  const setMediaRightsConfirmed = (value: boolean) =>
    updateReview({ mediaRightsConfirmed: value });
  const setMediaRightsNotes = (value: string) =>
    updateReview({ mediaRightsNotes: value });
  const reviewSaved = (id: string, draft: ReviewDraft) => {
    const saved = state.reviews.find(
      (review) =>
        review.compositionId === composition?.id && review.exportId === id,
    );
    return Boolean(
      saved &&
        JSON.stringify(saved.checklist) === JSON.stringify(draft.checklist) &&
        saved.feedback === draft.feedback.trim() &&
        saved.mediaRightsConfirmed === draft.mediaRightsConfirmed &&
        saved.mediaRightsNotes === draft.mediaRightsNotes.trim(),
    );
  };
  const anyReviewDirty = Object.entries(reviewDrafts).some(
    ([id, draft]) =>
      !reviewSaved(id, draft) &&
      (Object.values(draft.checklist).some(Boolean) ||
        draft.feedback.length > 0 ||
        draft.mediaRightsConfirmed ||
        draft.mediaRightsNotes.length > 0),
  );
  useEffect(() => {
    onDirtyChange?.(anyReviewDirty);
    return () => onDirtyChange?.(false);
  }, [anyReviewDirty, onDirtyChange]);
  const active = state.jobs.some(
    (job) =>
      job.kind === "render" && ["queued", "running"].includes(job.status),
  );
  const eligibility = state.eligibility.find(
    (entry) =>
      entry.compositionId === composition?.id &&
      entry.exportId === (output?.id || null),
  );
  const narrated = Boolean(composition?.voiceTakeId);
  const submitReview = (decision: "approved" | "needs_changes") => {
    if (!composition || !output) return;
    return onAction("consolidatedReview", {
      compositionId: composition.id,
      compositionChecksum: composition.checksum,
      exportId: output.id,
      decision,
      checklist,
      feedback,
      mediaRightsConfirmed,
      mediaRightsNotes,
    });
  };
  return (
    <div className="exports-panel">
      <h2>Exports & final review</h2>
      <p>
        Render an exact saved composition as 1080p MP4, with captions and its
        source description. Files remain private drafts.
      </p>
      <label>
        Output format
        <select
          value={format}
          disabled={busy || active}
          onChange={(event) => setFormat(event.target.value as ExportFormat)}
        >
          <option value="landscape">Landscape · 1920 × 1080</option>
          <option value="vertical">Vertical · 1080 × 1920</option>
          <option value="both">Both formats</option>
        </select>
      </label>
      <button
        type="button"
        className="primary-button"
        disabled={busy || active || dirty || !composition || composition.stale}
        onClick={() =>
          composition &&
          void onAction("render", {
            compositionId: composition.id,
            compositionChecksum: composition.checksum,
            format,
          })
        }
      >
        {active
          ? "Render in progress…"
          : `Render ${format === "both" ? "both formats" : format} private draft`}
      </button>
      {(!composition || composition.stale || dirty) && (
        <p className="status-message">
          Save a current preview and pending settings before rendering. Earlier
          files remain available.
        </p>
      )}
      {composition && (
        <p className="muted">
          Composition {composition.id.slice(0, 8)} · checksum{" "}
          {composition.checksum.slice(0, 12)}. New edits keep this queued
          snapshot intact.
        </p>
      )}
      {composition && (
        <section className="export-review">
          <h3>Consolidated review of this revision</h3>
          <p>
            Review the completed files. Approval records your explicit checks
            for this exact composition and export; rights remain separate.
          </p>
          {!output ? (
            <p>Render this saved revision before recording a final review.</p>
          ) : (
            <>
              <label>
                Review exported files
                <select
                  value={output.id}
                  disabled={busy}
                  onChange={(event) => {
                    setReviewExportId(event.target.value);
                  }}
                >
                  {exports.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {new Date(entry.createdAt).toLocaleString()} ·{" "}
                      {entry.formats.join(" + ")}
                    </option>
                  ))}
                </select>
              </label>
              <div className="export-links">
                {output.formats.map((orientation) => (
                  <a
                    key={orientation}
                    href={`/api/exports/${output.id}?format=${orientation}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Watch {orientation} MP4
                  </a>
                ))}
              </div>
              <fieldset disabled={busy}>
                <legend>Creator checklist</legend>
                {checks
                  .filter(([check]) => narrated || check !== "pronunciation")
                  .map(([check, label]) => (
                    <label className="export-check" key={check}>
                      <input
                        type="checkbox"
                        checked={checklist[check]}
                        onChange={(event) =>
                          setChecklist((current) => ({
                            ...current,
                            [check]: event.target.checked,
                          }))
                        }
                      />
                      {label}
                    </label>
                  ))}
              </fieldset>
              <label>
                Feedback or changes needed
                <textarea
                  value={feedback}
                  maxLength={6000}
                  disabled={busy}
                  rows={4}
                  onChange={(event) => setFeedback(event.target.value)}
                />
              </label>
              {Boolean(eligibility?.rights.media.ids.length) && (
                <fieldset disabled={busy}>
                  <legend>Uploaded media rights for this revision</legend>
                  <label className="export-check">
                    <input
                      type="checkbox"
                      checked={mediaRightsConfirmed}
                      onChange={(event) =>
                        setMediaRightsConfirmed(event.target.checked)
                      }
                    />
                    I own or have permission to publish every uploaded image and
                    audio track used here.
                  </label>
                  <label>
                    License or ownership notes
                    <textarea
                      value={mediaRightsNotes}
                      maxLength={2000}
                      rows={3}
                      onChange={(event) =>
                        setMediaRightsNotes(event.target.value)
                      }
                    />
                  </label>
                </fieldset>
              )}
              <div className="writing-actions">
                <button
                  type="button"
                  className="button"
                  disabled={busy || dirty}
                  onClick={() => void submitReview("needs_changes")}
                >
                  Record changes needed
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={
                    busy ||
                    dirty ||
                    missingReviewChecks(checklist, narrated).length > 0 ||
                    (mediaRightsConfirmed &&
                      Boolean(eligibility?.rights.media.ids.length) &&
                      !mediaRightsNotes.trim())
                  }
                  onClick={() => void submitReview("approved")}
                >
                  Approve this exact revision
                </button>
              </div>
              {latestReview && (
                <p role="status">
                  Latest creator decision:{" "}
                  {latestReview.decision === "approved"
                    ? "Approved revision"
                    : "Changes requested"}{" "}
                  · {new Date(latestReview.createdAt).toLocaleString()}
                </p>
              )}
            </>
          )}
          <h4>
            {eligibility?.publicationReady
              ? "Publication checklist complete"
              : "Publication requirements remain"}
          </h4>
          {eligibility?.blockers.length ? (
            <ul>
              {eligibility.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          ) : (
            <p>
              Creator review and saved source, speech, and media rights qualify
              for this exact revision. Current downloads remain private drafts;
              publication rendering and upload are separate actions.
            </p>
          )}
          <p className="muted">
            Saving a new composition requires a new exact-revision review. No
            checkbox clears a source license or changes the rights of a saved
            speech take.
          </p>
        </section>
      )}
      <section className="export-history">
        <h3>Export history · {state.exports.length}</h3>
        {!state.exports.length && <p>No exports yet.</p>}
        {state.exports.map((entry) => {
          const saved = state.compositions.find(
            (candidate) => candidate.id === entry.compositionId,
          );
          return (
            <article key={entry.id} className="export-links">
              <strong>
                {new Date(entry.createdAt).toLocaleString()} ·{" "}
                {entry.formats.join(" + ")} · Private draft
              </strong>
              <p>
                {saved?.data.title} ·{" "}
                {saved?.data.mode === "text" ? "Text only" : "Narrated"} ·
                composition {entry.compositionId.slice(0, 8)} · script{" "}
                {saved?.scriptId.slice(0, 8)}
                {saved?.voiceTakeId
                  ? ` · voice ${saved.voiceTakeId.slice(0, 8)}`
                  : ""}
                {saved?.captionTrackId
                  ? ` · captions ${saved.captionTrackId.slice(0, 8)}`
                  : ""}
              </p>
              {entry.formats.map((orientation) => (
                <a
                  key={orientation}
                  href={`/api/exports/${entry.id}?format=${orientation}&download=1`}
                >
                  {orientation === "landscape" ? "Landscape" : "Vertical"} MP4
                </a>
              ))}
              <a href={`/api/exports/${entry.id}?format=srt&download=1`}>
                Captions (SRT)
              </a>
              <a
                href={`/api/exports/${entry.id}?format=description&download=1`}
              >
                Source description
              </a>
            </article>
          );
        })}
      </section>
    </div>
  );
}
