"use client";

import { useRef, useState } from "react";
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
import { WorkflowSteps } from "./studio-nav";

const themeLabels = {
  hope: "Hope & reassurance",
  patience: "Sabr & perseverance",
  gratitude: "Gratitude",
  forgiveness: "Mercy & forgiveness",
  trust: "Trust in Allah",
};

export function EpisodeEditor({
  episode,
  initial,
}: {
  episode?: Episode;
  initial?: Partial<EpisodeInput>;
}) {
  const router = useRouter();
  const [values, setValues] = useState<EpisodeInput>(
    episode ?? { ...EMPTY_EPISODE, ...initial },
  );
  const [saved, setSaved] = useState<EpisodeInput | null>(episode ?? null);
  const [revision, setRevision] = useState(episode?.revision ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [layout, setLayout] = useState<"landscape" | "vertical">("landscape");
  const submitting = useRef(false);
  const dirty = JSON.stringify(values) !== JSON.stringify(saved);

  function change<K extends keyof EpisodeInput>(
    key: K,
    value: EpisodeInput[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
    setNotice("");
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
        router.replace(`/episodes/${result.episode.id}`);
        return;
      }
      setRevision(result.episode.revision);
      setSaved(values);
      setNotice("Saved to your workspace.");
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
      <div className="page-topline">
        <Link href="/" className="back-link">
          <ArrowLeft size={16} /> All episodes
        </Link>
        <span className="eyebrow">YOUR NEXT SMALL STEP</span>
      </div>
      <header className="page-heading editor-heading">
        <div>
          <div className="eyebrow">EPISODE BRIEF</div>
          <h1>
            {episode
              ? "Shape your reminder."
              : "Begin with a little intention."}
          </h1>
          <p>
            Who needs to hear this, and what do you hope they carry with them?
          </p>
        </div>
        <span className="pill">
          <span className="status-dot" /> Idea
        </span>
      </header>
      <WorkflowSteps />
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
                    {model.startsWith("openai")
                      ? "GPT-5.6 Luna"
                      : "Gemini 3.8 Flash"}
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
              Saving an idea uses no AI credits. Voice, source research, and
              generation arrive in the next stages.
            </p>
          </div>
        </aside>
      </form>
    </>
  );
}
