"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Button,
  Description,
  Input,
  Label,
  TextArea,
  TextField,
} from "@heroui/react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Leaf,
  Monitor,
  Smartphone,
  Sparkles,
} from "lucide-react";
import {
  durationLabel,
  EMPTY_EPISODE,
  episodeInputSchema,
  LLM_MODELS,
  THEMES,
  type Episode,
  type EpisodeInput,
} from "@/lib/domain/episode";
import type { IdeaDirection as DomainIdeaDirection } from "@/lib/domain/ideas";
import {
  useEpisodeWorkspace,
  useWorkspaceBuffer,
  useWorkspaceDraft,
} from "./episode-workspace";

const themeLabels = {
  hope: "Hope & reassurance",
  patience: "Sabr & perseverance",
  gratitude: "Gratitude",
  forgiveness: "Mercy & forgiveness",
  trust: "Trust in Allah",
};

export type IdeaDirection = DomainIdeaDirection;

export type IdeaSuggestionSet = {
  id: string;
  episodeRevision: number;
  model: EpisodeInput["llmModel"];
  instructions: string;
  input: Pick<EpisodeInput, "title" | "brief" | "theme" | "targetSeconds">;
  directions: IdeaDirection[];
  createdAt: string;
};

export type IdeaAssistanceJob = {
  id: string;
  kind: string;
  status: "queued" | "running" | "succeeded" | "failed" | "needs_attention";
  progress: string;
  error: string | null;
};

export type IdeaAssistanceState = {
  suggestions: IdeaSuggestionSet[];
  jobs: IdeaAssistanceJob[];
};

export type EpisodeEditorProps = {
  episode?: Episode;
  initial?: Partial<EpisodeInput>;
  ideaAssistance?: IdeaAssistanceState;
  ideaAssistanceUnavailable?: boolean;
};

function modelLabel(model: EpisodeInput["llmModel"]) {
  return model.startsWith("openai") ? "GPT-5.6 Luna" : "Gemini 3.8 Flash";
}

export function EpisodeEditor({
  episode,
  initial,
  ideaAssistance,
  ideaAssistanceUnavailable,
}: EpisodeEditorProps) {
  const router = useRouter();
  const { refreshWorkspace } = useEpisodeWorkspace();
  const [draft, setDraft, clearDraft] = useWorkspaceBuffer<{
    values: EpisodeInput;
    saved: EpisodeInput | null;
    revision: number;
  }>(`brief:${episode?.id || "new"}`, {
    values: episode ?? { ...EMPTY_EPISODE, ...initial },
    saved: episode ?? null,
    revision: episode?.revision ?? 0,
  });
  const { values, saved, revision } = draft;
  const [assistanceDraft, setAssistanceDraft] = useWorkspaceBuffer<{
    instructions: string;
    model: EpisodeInput["llmModel"];
  }>(`idea-assistance:${episode?.id || "new"}`, {
    instructions: "",
    model: episode?.llmModel ?? EMPTY_EPISODE.llmModel,
  });
  const [ideaStateOverride, setIdeaStateOverride] = useState<{
    sourceKey: string | undefined;
    value: IdeaAssistanceState;
  } | null>(null);
  const ideaAssistanceKey = JSON.stringify({
    state: ideaAssistance,
    unavailable: ideaAssistanceUnavailable,
  });
  const ideaState =
    ideaStateOverride && ideaStateOverride.sourceKey === ideaAssistanceKey
      ? ideaStateOverride.value
      : ideaAssistance;
  const [ideaBusy, setIdeaBusy] = useState(false);
  const [ideaError, setIdeaError] = useState("");
  const [ideaPollError, setIdeaPollError] = useState("");
  const [ideaNotice, setIdeaNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [layout, setLayout] = useState<"landscape" | "vertical">("landscape");
  const submitting = useRef(false);
  const dirty = JSON.stringify(values) !== JSON.stringify(saved);
  useWorkspaceDraft({ dirty, saving: busy });

  const showIdeaState = useCallback(
    (value: IdeaAssistanceState) => {
      setIdeaStateOverride({ sourceKey: ideaAssistanceKey, value });
    },
    [ideaAssistanceKey],
  );

  const refreshIdeas = useCallback(async () => {
    if (!episode || !ideaAssistance) return;
    const response = await fetch(`/api/episodes/${episode.id}/ideas`);
    if (!response.ok) throw new Error("Could not refresh idea suggestions.");
    const next = (await response.json()) as IdeaAssistanceState;
    showIdeaState(next);
    setIdeaPollError("");
    return next;
  }, [episode, ideaAssistance, showIdeaState]);

  const ideaActive = Boolean(
    ideaState?.jobs.some((job) =>
      ["queued", "running"].includes(job.status),
    ),
  );
  const ideaEpisodeId = episode?.id;

  useEffect(() => {
    if (!ideaEpisodeId || !ideaAssistance || ideaAssistanceUnavailable) return;
    const episodeId = ideaEpisodeId;
    let stopped = false;
    const controller = new AbortController();
    let timer: number | undefined;
    let shouldContinuePolling = ideaActive;
    async function refreshAndPoll() {
      try {
        const response = await fetch(`/api/episodes/${episodeId}/ideas`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Could not refresh idea suggestions.");
        const next = (await response.json()) as IdeaAssistanceState;
        if (stopped) return;
        showIdeaState(next);
        setIdeaPollError("");
        shouldContinuePolling = next.jobs.some((job) =>
          ["queued", "running"].includes(job.status),
        );
      } catch {
        if (stopped || controller.signal.aborted) return;
        setIdeaPollError(
          "Could not check idea assistance progress. Retrying automatically.",
        );
        shouldContinuePolling = true;
      }
      if (!stopped && shouldContinuePolling) {
        timer = window.setTimeout(() => void refreshAndPoll(), 2000);
      }
    }
    void refreshAndPoll();
    return () => {
      stopped = true;
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [
    ideaEpisodeId,
    ideaActive,
    ideaAssistance,
    ideaAssistanceUnavailable,
    showIdeaState,
  ]);

  const visibleIdeaJobs = (() => {
    if (!ideaState) return [];
    const importantJobs = ideaState.jobs.filter((job) =>
      ["queued", "running", "needs_attention", "failed"].includes(job.status),
    );
    const included = new Set(importantJobs.map((job) => job.id));
    return [
      ...importantJobs,
      ...ideaState.jobs.filter((job) => !included.has(job.id)).slice(0, 3),
    ];
  })();

  function change<K extends keyof EpisodeInput>(
    key: K,
    value: EpisodeInput[K],
  ) {
    setDraft((current) => ({
      ...current,
      values: { ...current.values, [key]: value },
    }));
    setNotice("");
  }

  async function ideaRequest(
    action: "generate" | "retry",
    data: Record<string, unknown>,
  ) {
    if (!episode || !ideaAssistance || ideaAssistanceUnavailable) return;
    setIdeaBusy(true);
    setIdeaError("");
    setIdeaPollError("");
    setIdeaNotice("");
    try {
      const response = await fetch(`/api/episodes/${episode.id}/ideas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, data }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not start idea assistance.");
      if (Array.isArray(result.suggestions) && Array.isArray(result.jobs))
        showIdeaState(result as IdeaAssistanceState);
      else await refreshIdeas();
    } catch (caught) {
      setIdeaError(
        caught instanceof Error
          ? caught.message
          : "Could not reach idea assistance.",
      );
    } finally {
      setIdeaBusy(false);
    }
  }

  function applyDirectionToBrief(direction: IdeaDirection) {
    change(
      "brief",
      [
        `Angle: ${direction.angle}`,
        `Hook: ${direction.hook}`,
        `Practical takeaway: ${direction.takeaway}`,
      ]
        .join("\n\n")
        .slice(0, 5000),
    );
    setIdeaNotice("Direction applied to the local brief. Save when it feels right.");
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const parsed = episodeInputSchema.safeParse(values);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        episode ? `/api/episodes/${episode.id}` : "/api/episodes",
        {
          method: episode ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            episode ? { ...parsed.data, revision } : parsed.data,
          ),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        setError(
          result.error || "Could not save. Your changes are still here.",
        );
        return;
      }
      if (!episode) {
        clearDraft();
        router.replace(`/episodes/${result.episode.id}`);
        return;
      }
      let hasNewEdits = false;
      setDraft((current) => {
        hasNewEdits = JSON.stringify(current.values) !== JSON.stringify(values);
        return { ...current, revision: result.episode.revision, saved: values };
      });
      if (!hasNewEdits) clearDraft();
      setNotice("Saved to your workspace.");
      void refreshWorkspace();
      router.refresh();
    } catch {
      setError(
        "Could not reach the studio. Your changes are still here; try again.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      {!episode && (
        <div className="page-topline">
          <Link href="/" className="back-link">
            <ArrowLeft size={16} /> All episodes
          </Link>
          <span className="eyebrow">YOUR NEXT SMALL STEP</span>
        </div>
      )}
      <header
        className={
          episode ? "workspace-section-heading" : "page-heading editor-heading"
        }
      >
        <div>
          <div className="eyebrow">EPISODE BRIEF</div>
          {episode ? (
            <h2>Idea & intention</h2>
          ) : (
            <h1>Begin with a little intention.</h1>
          )}
          <p>
            Who needs to hear this, and what do you hope they carry with them?
          </p>
        </div>
        {!episode && (
          <span className="pill">
            <span className="status-dot" /> New episode
          </span>
        )}
      </header>
      {!episode && (
        <p className="source-notice">
          Create your episode to open script, voice, music, backgrounds, and
          export controls.
        </p>
      )}
      <form onSubmit={save} className="editor-grid">
        <section className="editor-main panel">
          <div className="section-kicker">
            <span>01</span> THE INTENTION
          </div>
          <TextField
            name="title"
            isRequired
            value={values.title}
            onChange={(value) => change("title", value)}
            maxLength={140}
          >
            <Label>Working title</Label>
            <Input
              placeholder="A reminder for the days you feel behind"
              className="studio-input"
            />
            <Description>
              It can change. Start with the feeling you want to speak to.
            </Description>
          </TextField>
          <TextField
            name="brief"
            value={values.brief}
            onChange={(value) => change("brief", value)}
            maxLength={5000}
          >
            <Label>What is this reminder about?</Label>
            <TextArea
              className="studio-textarea"
              rows={6}
              placeholder="Someone has been making du’a for a long time and is beginning to lose hope. I want to help them feel understood, reconnect with trust, and take one gentle step forward…"
            />
            <Description>
              Your audience, their struggle, and one practical takeaway.
            </Description>
          </TextField>
          {episode &&
            (ideaAssistance || ideaAssistanceUnavailable) &&
            ideaState && (
            <section className="idea-assistance" aria-labelledby="idea-assistance-title">
              <div className="idea-assistance-heading">
                <div>
                  <span className="eyebrow">OPTIONAL AI ASSISTANCE</span>
                  <h3 id="idea-assistance-title">Develop this idea</h3>
                  <p>
                    Ask for a few directions, then choose what belongs in your
                    brief. Suggestions never replace your work automatically.
                  </p>
                </div>
                <Sparkles size={19} aria-hidden="true" />
              </div>
              <label className="idea-instructions">
                Direction for the next suggestions
                <textarea
                  value={assistanceDraft.instructions}
                  maxLength={2000}
                  placeholder="For example: more reassuring, less formal, focus on patience."
                  onChange={(event) =>
                    setAssistanceDraft((current) => ({
                      ...current,
                      instructions: event.target.value,
                    }))
                  }
                />
              </label>
              <div className="idea-generation-actions">
                <label className="select-field">
                  Model for this request
                  <select
                    value={assistanceDraft.model}
                    onChange={(event) =>
                      setAssistanceDraft((current) => ({
                        ...current,
                        model: event.target.value as EpisodeInput["llmModel"],
                      }))
                    }
                  >
                    {LLM_MODELS.map((model) => (
                      <option value={model} key={model}>
                        {modelLabel(model)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="button primary-action"
                  disabled={
                    ideaBusy ||
                    ideaActive ||
                    !values.brief.trim() ||
                    ideaAssistanceUnavailable
                  }
                  onClick={() =>
                    void ideaRequest("generate", {
                      episodeRevision: revision,
                      model: assistanceDraft.model,
                      instructions: assistanceDraft.instructions,
                      input: {
                        title: values.title,
                        brief: values.brief,
                        theme: values.theme,
                        targetSeconds: values.targetSeconds,
                      },
                    })
                  }
                >
                  <Sparkles size={15} aria-hidden="true" />
                  {ideaActive
                    ? "Thinking…"
                    : ideaState.suggestions.length
                      ? "Suggest another"
                      : "Suggest directions"}
                </button>
              </div>
              <p className="idea-generation-note">
                Uses the open brief above as a snapshot. You can keep editing
                while the durable job runs.
              </p>
              {ideaAssistanceUnavailable && (
                <p className="idea-error" role="status">
                  Idea assistance is temporarily unavailable. Reload this page
                  to check again; your brief remains available to edit.
                </p>
              )}
              {(ideaNotice || ideaError || ideaPollError) && (
                <p
                  className={ideaError || ideaPollError ? "idea-error" : "idea-notice"}
                  role={ideaError ? "alert" : "status"}
                >
                  {ideaError || ideaPollError || ideaNotice}
                </p>
              )}
              <div className="idea-jobs" aria-live="polite" aria-busy={ideaActive}>
                {visibleIdeaJobs.map((job) => (
                  <div key={job.id} className={`idea-job is-${job.status}`}>
                    <div>
                      <strong>
                        {job.status === "needs_attention"
                          ? "Needs attention"
                          : `${job.status.slice(0, 1).toUpperCase()}${job.status.slice(1)}`}
                      </strong>
                      <span>
                        {job.progress ||
                          (job.status === "needs_attention"
                            ? "This request needs attention before it can continue."
                            : "")}
                      </span>
                      {job.error && <span>{job.error.replaceAll("_", " ")}</span>}
                    </div>
                    {job.status === "failed" && job.kind === "idea_suggestion" && (
                      <button
                        type="button"
                        className="text-link"
                        disabled={ideaBusy || ideaAssistanceUnavailable}
                        onClick={() =>
                          void ideaRequest("retry", { jobId: job.id })
                        }
                      >
                        Retry stopped job
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {ideaState.suggestions.length > 0 && (
                <div className="idea-suggestion-history">
                  <h4>Saved directions</h4>
                  {ideaState.suggestions.map((set) => (
                    <section className="idea-suggestion-set" key={set.id}>
                      <header>
                        <strong>{modelLabel(set.model)}</strong>
                        <span>
                          Based on revision {set.episodeRevision} ·{" "}
                          <time dateTime={set.createdAt}>
                            {new Date(set.createdAt).toLocaleString()}
                          </time>
                        </span>
                        <small>
                          {set.instructions || "No extra direction"}
                        </small>
                      </header>
                      <div className="idea-direction-grid">
                        {set.directions.map((direction, index) => (
                          <article
                            className="idea-direction-card"
                            key={`${set.id}:${index}`}
                          >
                            <span className="eyebrow">DIRECTION {index + 1}</span>
                            <h5>{direction.title}</h5>
                            <dl>
                              <div>
                                <dt>Angle</dt>
                                <dd>{direction.angle}</dd>
                              </div>
                              <div>
                                <dt>Hook</dt>
                                <dd>{direction.hook}</dd>
                              </div>
                              <div>
                                <dt>Practical takeaway</dt>
                                <dd>{direction.takeaway}</dd>
                              </div>
                            </dl>
                            <div className="idea-direction-actions">
                              <button
                                type="button"
                                className="button"
                                disabled={busy}
                                onClick={() => {
                                  change("title", direction.title.slice(0, 140));
                                  setIdeaNotice(
                                    "Title applied locally. Save when it feels right.",
                                  );
                                }}
                              >
                                Use title
                              </button>
                              <button
                                type="button"
                                className="button"
                                disabled={busy}
                                onClick={() => applyDirectionToBrief(direction)}
                              >
                                Use as brief
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </section>
          )}
          <div className="field-row">
            <label className="select-field">
              Theme
              <select
                name="theme"
                value={values.theme}
                onChange={(event) =>
                  change("theme", event.target.value as EpisodeInput["theme"])
                }
              >
                {THEMES.map((theme) => (
                  <option key={theme} value={theme}>
                    {themeLabels[theme]}
                  </option>
                ))}
              </select>
            </label>
            <label className="select-field">
              Target length
              <select
                name="targetSeconds"
                value={values.targetSeconds}
                onChange={(event) =>
                  change("targetSeconds", Number(event.target.value))
                }
              >
                {[60, 90, 120, 150, 180, 240, 300].map((time) => (
                  <option key={time} value={time}>
                    {durationLabel(time)}
                    {time === 120 ? " · a gentle starting point" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-divider" />
          <div className="section-kicker">
            <span>02</span> THE DETAILS
          </div>
          <fieldset className="format-field">
            <legend>Video format</legend>
            <div className="choice-row">
              {[
                { value: "both", label: "Both formats", icon: Sparkles },
                { value: "landscape", label: "Landscape", icon: Monitor },
                { value: "vertical", label: "Vertical", icon: Smartphone },
              ].map(({ value, label, icon: Icon }) => (
                <label
                  key={value}
                  className={`format-choice ${values.format === value ? "selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="format"
                    value={value}
                    checked={values.format === value}
                    onChange={() =>
                      change("format", value as EpisodeInput["format"])
                    }
                  />
                  <Icon size={17} />
                  {label}
                  {values.format === value && <Check size={14} />}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="field-row">
            <label className="select-field">
              Script model
              <select
                name="llmModel"
                value={values.llmModel}
                onChange={(event) =>
                  change(
                    "llmModel",
                    event.target.value as EpisodeInput["llmModel"],
                  )
                }
              >
                {LLM_MODELS.map((model) => (
                  <option value={model} key={model}>
                    {modelLabel(model)}
                  </option>
                ))}
              </select>
            </label>
            <label className="select-field">
              Narration preference
              <select
                name="narrationProvider"
                value={values.narrationProvider}
                onChange={(event) =>
                  change(
                    "narrationProvider",
                    event.target.value as EpisodeInput["narrationProvider"],
                  )
                }
              >
                <option value="auto">Use available credits first</option>
                <option value="cartesia">Cartesia</option>
                <option value="elevenlabs">ElevenLabs</option>
                <option value="deepgram">Deepgram</option>
              </select>
            </label>
          </div>
          <label className="select-field">
            Intended use
            <select
              name="purpose"
              value={values.purpose}
              onChange={(event) =>
                change("purpose", event.target.value as EpisodeInput["purpose"])
              }
            >
              <option value="publish">
                For the channel · publishing rights needed
              </option>
              <option value="audition">
                Private audition · explore voices
              </option>
            </select>
          </label>
          <div className="save-bar">
            <div aria-live="polite">
              {notice ? (
                <span className="save-success">
                  <Check size={15} />
                  {notice}
                </span>
              ) : (
                <span className="muted">
                  {dirty ? "Unsaved changes" : "Saved to your workspace"}
                </span>
              )}
            </div>
            <Button
              type="submit"
              className="primary-action"
              isDisabled={busy || (!dirty && Boolean(episode))}
            >
              {busy ? "Saving…" : episode ? "Save changes" : "Create episode"}
              <ArrowUpRight size={17} />
            </Button>
          </div>
          {error && (
            <div role="alert" className="form-error">
              {error}
            </div>
          )}
        </section>
        <aside className="editor-aside">
          <section className="preview-panel">
            <div className="preview-heading">
              <span className="eyebrow">A LITTLE PERSPECTIVE</span>
              <div className="preview-tabs">
                <button
                  type="button"
                  aria-label="Landscape layout sketch"
                  aria-pressed={layout === "landscape"}
                  onClick={() => setLayout("landscape")}
                >
                  <Monitor size={15} />
                </button>
                <button
                  type="button"
                  aria-label="Vertical layout sketch"
                  aria-pressed={layout === "vertical"}
                  onClick={() => setLayout("vertical")}
                >
                  <Smartphone size={15} />
                </button>
              </div>
            </div>
            <div className={`composition-sketch ${layout}`}>
              <div className="sketch-orbit" />
              <Leaf className="sketch-leaf" size={20} strokeWidth={1} />
              <p>
                {values.title.trim() || "Even a small step\nis a beginning."}
              </p>
              <span>SABR & STEPS</span>
            </div>
            <div className="preview-foot">
              <span>Centered words. Space to breathe.</span>
              <span>{layout === "landscape" ? "16:9" : "9:16"}</span>
            </div>
            <p className="sketch-disclaimer">
              Layout sketch · your video preview comes later.
            </p>
          </section>
          <section className="quiet-note">
            <Leaf size={20} />
            <h3>Start with care.</h3>
            <p>
              Acknowledge a real struggle. Ground the reminder in a verified
              source. Leave the viewer with one small, possible step.
            </p>
          </section>
          <div className="credit-note">
            <span className="status-dot" />
            <p>
              Saving an idea uses no AI credits. Use the editor sections to work
              on your script, voice, picture, and sound.
            </p>
          </div>
        </aside>
      </form>
    </>
  );
}
