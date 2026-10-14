"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, Input, Label, TextArea, TextField } from "@heroui/react";
import { LLM_MODELS, THEMES } from "@/lib/domain/episode";
import {
  automationRequestSchema,
  type AutomationRequest,
} from "@/lib/domain/automation";
import type { AutomationState } from "@/lib/server/automation/store";
import styles from "./automation-workspace.module.css";

const modelName = (model: string) =>
  model.startsWith("openai") ? "GPT-5.6 Luna" : "Gemini 3.8 Flash";

export function AutomationWorkspace({ initial }: { initial: AutomationState }) {
  const [state, setState] = useState(initial);
  const [profileId, setProfileId] = useState(initial.profiles[0]?.id || "");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [pending, setPending] = useState<AutomationRequest | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  async function refresh() {
    const response = await fetch("/api/automation", { cache: "no-store" });
    if (!response.ok)
      throw new Error(
        "Progress is unavailable. Saved work will reappear when the connection returns.",
      );
    const updated: AutomationState = await response.json();
    setState(updated);
    setRefreshError("");
    return updated;
  }
  useEffect(() => {
    const hydrate = setTimeout(() => {
      const retained = sessionStorage.getItem("sabr-pending-production");
      if (retained) {
        try {
          const request = automationRequestSchema.parse(JSON.parse(retained));
          setPending(request);
          setProfileId(request.profileId);
          setNotice(
            `Confirm the previous request for “${request.title}” to recover the same episode.`,
          );
        } catch {
          sessionStorage.removeItem("sabr-pending-production");
        }
      }
      setHydrated(true);
    }, 0);
    const timer = setInterval(() => {
      void refresh().catch((e) => setRefreshError(e.message));
    }, 3000);
    return () => {
      clearTimeout(hydrate);
      clearInterval(timer);
    };
  }, []);

  async function post(action: string, data: unknown) {
    const response = await fetch("/api/automation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, data }),
    });
    const result = await response.json();
    if (!response.ok)
      throw Object.assign(
        new Error(result.error || "Request failed. Your input is retained."),
        { status: response.status },
      );
    return result;
  }
  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await post("profile", {
        name: fields.get("name"),
        importId: fields.get("importId"),
        model: fields.get("model"),
        theme: fields.get("theme"),
        targetSeconds: Number(fields.get("targetSeconds")),
        instructions: fields.get("instructions"),
        readingWpm: Number(fields.get("readingWpm")),
        background: fields.get("background"),
        imageId: fields.get("imageId") || null,
        musicId: fields.get("musicId") || null,
        musicVolume: Number(fields.get("musicVolume")),
        maxEstimatedUsd: Number(fields.get("maxEstimatedUsd")),
      });
      setProfileId(result.profile.id);
      await refresh();
      setNotice("Profile saved. New runs will use these exact settings.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the profile.");
    } finally {
      setBusy(false);
    }
  }
  async function start(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const request = pending || {
      requestId: crypto.randomUUID(),
      profileId,
      title: String(fields.get("title")),
      brief: String(fields.get("brief")),
    };
    setPending(request);
    sessionStorage.setItem("sabr-pending-production", JSON.stringify(request));
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await post("start", request);
      setPending(null);
      sessionStorage.removeItem("sabr-pending-production");
      form.current?.reset();
      setNotice(
        "Draft queued. Open its episode to follow the script, video and exports.",
      );
      await refresh();
    } catch (e) {
      const status = (e as Error & { status?: number }).status;
      if (status && status >= 400 && status < 500) {
        setPending(null);
        sessionStorage.removeItem("sabr-pending-production");
      }
      setError(
        e instanceof Error
          ? e.message
          : "Could not confirm the request. Retry to recover the same episode.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function retry(id: string) {
    setBusy(true);
    setError("");
    try {
      await post("retry", { runId: id });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Retry unavailable.");
    } finally {
      setBusy(false);
    }
  }

  const selected = state.profiles.find((p) => p.id === profileId);
  return (
    <>
      <header className="page-heading">
        <div>
          <span className="eyebrow">FROM TOPIC TO PRIVATE VIDEO</span>
          <h1>Draft automation</h1>
          <p>
            Save your defaults, add a topic, and prepare two text-only videos
            for review.
          </p>
        </div>
      </header>
      <p className={styles.intro}>
        Each run creates a new episode with an unreviewed script, reading cards,
        landscape and vertical drafts, captions, and source references. Your
        existing episodes stay available.
      </p>
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {refreshError && (
        <p role="alert" className={styles.error}>
          {refreshError}
        </p>
      )}
      <div className={styles.grid}>
        <section className={`panel ${styles.panel}`}>
          <h2>Save a profile</h2>
          <p>
            Profiles retain their settings. Save another profile when your
            defaults change.
          </p>
          <form onSubmit={saveProfile} className={styles.form}>
            <TextField isRequired name="name">
              <Label>Profile name</Label>
              <Input maxLength={100} placeholder="Calm reminders" />
            </TextField>
            <label>
              Qur’an source
              <select
                name="importId"
                required
                defaultValue={state.sources[0]?.id || ""}
              >
                {!state.sources.length && (
                  <option value="">Import a source first</option>
                )}
                {state.sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.expectedChapters}/114 chapters ·{" "}
                    {s.rightsStatus === "cleared"
                      ? "reuse cleared"
                      : "reuse not cleared"}
                  </option>
                ))}
              </select>
            </label>
            <div className={styles.pair}>
              <label>
                Script model
                <select name="model">
                  {LLM_MODELS.map((m) => (
                    <option key={m} value={m}>
                      {modelName(m)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Theme
                <select name="theme">
                  {THEMES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className={styles.pair}>
              <TextField name="targetSeconds" defaultValue="120" isRequired>
                <Label>Target seconds</Label>
                <Input type="number" min={60} max={300} />
              </TextField>
              <TextField name="readingWpm" defaultValue="110" isRequired>
                <Label>Reading words/minute</Label>
                <Input type="number" min={70} max={180} />
              </TextField>
            </div>
            <TextField name="instructions">
              <Label>Editorial direction</Label>
              <TextArea
                maxLength={2000}
                placeholder="Acknowledge the difficulty and offer one gentle practical step."
              />
            </TextField>
            <label>
              Background palette
              <select name="background">
                <option value="forest">Forest</option>
                <option value="dusk">Dusk</option>
                <option value="sand">Sand</option>
              </select>
            </label>
            <label>
              Uploaded background
              <select name="imageId">
                <option value="">Use the palette</option>
                {state.assets
                  .filter((a) => ["image", "video"].includes(a.kind))
                  .map((a) => (
                    <option value={a.id} key={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Music
              <select name="musicId">
                <option value="">Silence</option>
                {state.assets
                  .filter((a) => a.kind === "audio")
                  .map((a) => (
                    <option value={a.id} key={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </label>
            <div className={styles.pair}>
              <TextField name="musicVolume" defaultValue="0.15" isRequired>
                <Label>Music level (0–0.5)</Label>
                <Input type="number" min={0} max={0.5} step={0.01} />
              </TextField>
              <TextField name="maxEstimatedUsd" defaultValue="0.05" isRequired>
                <Label>Inference budget (USD)</Label>
                <Input type="number" min={0.001} max={0.1} step={0.001} />
              </TextField>
            </div>
            <p className={styles.hint}>
              The budget covers this run’s inference reservations, including
              embeddings. Generation aims for the target duration; reading speed
              determines the final length, up to five minutes. Upload media in
              an episode’s Music or Backgrounds section.
            </p>
            <Button type="submit" isDisabled={busy || !state.sources.length}>
              Save profile
            </Button>
          </form>
        </section>
        <section className={`panel ${styles.panel}`}>
          <h2>Prepare a draft</h2>
          <form onSubmit={start} ref={form} className={styles.form}>
            <label>
              Saved profile
              <select
                value={profileId}
                onChange={(e) => setProfileId(e.target.value)}
                required
                disabled={busy || !hydrated || Boolean(pending)}
              >
                {!state.profiles.length && (
                  <option value="">Save a profile first</option>
                )}
                {state.profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {modelName(p.model)}
                  </option>
                ))}
              </select>
            </label>
            {selected && (
              <p className={styles.hint}>
                {selected.targetSeconds}-second target · {selected.readingWpm}{" "}
                words/minute · both formats · $
                {selected.maxEstimatedUsd.toFixed(3)} inference reservation
                limit
              </p>
            )}
            <TextField
              name="title"
              isRequired={!pending}
              isDisabled={busy || !hydrated || Boolean(pending)}
            >
              <Label>Working title</Label>
              <Input maxLength={140} />
            </TextField>
            <TextField
              name="brief"
              isRequired={!pending}
              isDisabled={busy || !hydrated || Boolean(pending)}
            >
              <Label>Topic and emotional need</Label>
              <TextArea
                maxLength={5000}
                placeholder="I have tried for months and feel that nothing is changing."
              />
            </TextField>
            <Button
              type="submit"
              isDisabled={busy || !hydrated || (!profileId && !pending)}
            >
              {pending
                ? "Confirm previous request"
                : "Generate complete private draft"}
            </Button>
          </form>
          <p className={styles.hint}>
            Queued work runs when the studio worker is available. Completed
            videos require your source, visual and playback review. Source and
            media reuse rights remain separate.
          </p>
          <h2>Recent runs</h2>
          {!state.runs.length && <p>Your first run will appear here.</p>}
          <div className={styles.runs}>
            {state.runs.map((run) => (
              <article key={run.id} className={styles.run}>
                <Link href={`/episodes/${run.episodeId}`}>
                  <strong>{run.title}</strong>
                </Link>
                <span>
                  {run.profileName} ·{" "}
                  {run.status === "succeeded"
                    ? "Ready for review"
                    : run.status === "needs_attention"
                      ? "Needs reconciliation"
                      : run.status}
                </span>
                <p>{run.progress}</p>
                <small>
                  ${run.estimatedOrReportedUsd.toFixed(5)} reserved/reported · $
                  {run.budgetUsd.toFixed(3)} limit
                </small>
                {run.error && <p className={styles.error}>{run.error}</p>}
                {run.status === "needs_attention" && (
                  <p>
                    Provider outcome is uncertain. Reconcile it before another
                    dispatch.
                  </p>
                )}
                {run.status === "failed" && (
                  <Button isDisabled={busy} onPress={() => void retry(run.id)}>
                    Retry retained run
                  </Button>
                )}
                <Link
                  href={`/episodes/${run.episodeId}/studio?section=${run.exportId ? "exports" : "video"}`}
                  className="text-link"
                >
                  {run.exportId ? "Review exports" : "Open episode"}
                </Link>
              </article>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
