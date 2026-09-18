"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  useEpisodeWorkspace,
  useWorkspaceDraft,
  useWorkspaceBuffer,
} from "./episode-workspace";
import { Player } from "@remotion/player";
import type { MediaState } from "@/lib/server/media/state";
import { EpisodeFilm } from "@/video/episode-film";
import type { Cue } from "@/lib/domain/media";
type Voices = {
  account: { remaining: number; tier: string; commercial: boolean };
  voices: {
    voice_id: string;
    name: string;
    labels?: Record<string, string>;
    preview_url?: string | null;
  }[];
};
export function MediaStudio({ initial }: { initial: MediaState }) {
  const searchParams = useSearchParams();
  const requestedSection = searchParams.get("section");
  const section = ["voice", "music", "background", "exports"].includes(
    requestedSection || "",
  )
    ? requestedSection
    : "video";
  const { refreshWorkspace } = useEpisodeWorkspace();
  const saved = initial.compositions[0]?.data;
  const [mode, setMode, clearMode] = useWorkspaceBuffer<"narrated" | "text">(
    "media:mode",
    saved?.mode || "narrated",
  );
  const [readingWpm, setReadingWpm, clearReadingWpm] = useWorkspaceBuffer(
    "media:readingWpm",
    saved?.readingWpm || 110,
  );
  const [imageId, setImageId, clearImageId] = useWorkspaceBuffer(
    "media:imageId",
    saved?.image?.id || "",
  );
  const [imageDim, setImageDim, clearImageDim] = useWorkspaceBuffer(
    "media:imageDim",
    saved?.imageDim ?? 0.45,
  );
  const [imagePosition, setImagePosition, clearImagePosition] =
    useWorkspaceBuffer("media:imagePosition", saved?.imagePosition ?? 50);
  const [musicId, setMusicId, clearMusicId] = useWorkspaceBuffer(
    "media:musicId",
    saved?.music?.id || "",
  );
  const [musicVolume, setMusicVolume, clearMusicVolume] = useWorkspaceBuffer(
    "media:musicVolume",
    saved?.musicVolume ?? 0.2,
  );
  const [musicLoop, setMusicLoop, clearMusicLoop] = useWorkspaceBuffer(
    "media:musicLoop",
    saved?.musicLoop ?? true,
  );
  const [musicFade, setMusicFade, clearMusicFade] = useWorkspaceBuffer(
    "media:musicFade",
    saved?.musicFade ?? 3,
  );
  const [background, setBackground, clearBackground] = useWorkspaceBuffer<
    "forest" | "dusk" | "sand"
  >("media:background", saved?.background || "forest");
  const [volume, setVolume, clearVolume] = useWorkspaceBuffer(
    "media:volume",
    saved?.narrationVolume ?? 1,
  );
  const [uploadKind, setUploadKind] = useWorkspaceBuffer<"image" | "audio">(
    "media:uploadKind",
    "image",
  );
  const [uploadName, setUploadName, clearUploadName] = useWorkspaceBuffer(
    "media:uploadName",
    "",
  );
  const [provenance, setProvenance, clearProvenance] = useWorkspaceBuffer(
    "media:provenance",
    "",
  );
  const [uploadFile, setUploadFile, clearUploadFile] =
    useWorkspaceBuffer<File | null>("media:uploadFile", null);
  const [voice, setVoice] = useWorkspaceBuffer("media:voice", "");
  const [override, setOverride] = useWorkspaceBuffer("media:override", false);
  const [speed, setSpeed] = useWorkspaceBuffer("media:speed", 1);
  const [reviewMode, setReviewMode] = useWorkspaceBuffer<
    "stages" | "consolidated"
  >("media:reviewMode", "consolidated");
  const [vertical, setVertical] = useWorkspaceBuffer("media:vertical", false);
  const [timing, setTiming, clearTiming] = useWorkspaceBuffer<{
    id: string;
    cues: Cue[];
  } | null>("media:timing", null);
  const [state, setState] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [voices, setVoices] = useState<Voices | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const settingsSnapshot = JSON.stringify({
    mode,
    readingWpm,
    imageId,
    imageDim,
    imagePosition,
    musicId,
    musicVolume,
    musicLoop,
    musicFade,
    background,
    volume,
  });
  const latestDraft = useRef({
    settingsSnapshot,
    timing,
    uploadKind,
    uploadName,
    provenance,
    uploadFile,
  });
  useEffect(() => {
    latestDraft.current = {
      settingsSnapshot,
      timing,
      uploadKind,
      uploadName,
      provenance,
      uploadFile,
    };
  }, [
    settingsSnapshot,
    timing,
    uploadKind,
    uploadName,
    provenance,
    uploadFile,
  ]);
  const script = state.scripts[0],
    take = state.takes.find((t) => !t.stale),
    track = state.tracks.find((t) => t.voiceTakeId === take?.id),
    composition = state.compositions[0],
    output = state.exports.find((e) => e.compositionId === composition?.id);
  const preview = composition;
  const baseline = preview?.data;
  const settingsDirty =
    (baseline?.mode || "narrated") !== mode ||
    (baseline?.background || "forest") !== background ||
    (baseline?.narrationVolume ?? 1) !== volume ||
    (baseline?.image?.id || "") !== imageId ||
    (baseline?.music?.id || "") !== musicId ||
    (baseline?.imageDim ?? 0.45) !== imageDim ||
    (baseline?.imagePosition ?? 50) !== imagePosition ||
    (baseline?.musicVolume ?? 0.2) !== musicVolume ||
    (baseline?.musicLoop ?? true) !== musicLoop ||
    (baseline?.musicFade ?? 3) !== musicFade ||
    (baseline?.readingWpm ?? 110) !== readingWpm;
  const narrationSetupDirty =
    mode === "narrated" &&
    (voice !== "" ||
      override ||
      speed !== 1 ||
      reviewMode !== "consolidated");
  useWorkspaceDraft({
    dirty:
      settingsDirty ||
      narrationSetupDirty ||
      Boolean(timing) ||
      Boolean(uploadFile || uploadName || provenance),
    saving: busy,
  });
  const cues =
    timing && timing.id === track?.id ? timing.cues : track?.cues || [];
  const active = state.jobs.some((j) =>
    ["queued", "running"].includes(j.status),
  );
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const timer = setInterval(() => {
      void fetch(`/api/episodes/${initial.episode.id}/media`)
        .then(async (r) => {
          if (r.ok && !stopped) {
            const fresh: MediaState = await r.json();
            setState(fresh);
            if (
              !fresh.jobs.some((job) =>
                ["queued", "running"].includes(job.status),
              )
            ) {
              await refreshWorkspace();
            }
          }
        })
        .catch(() => undefined);
    }, 2000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [active, initial.episode.id, refreshWorkspace]);
  async function act(action: string, data: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/episodes/${state.episode.id}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, data }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      const fresh = await fetch(`/api/episodes/${state.episode.id}/media`);
      if (!fresh.ok) throw new Error("Could not refresh studio");
      setState(await fresh.json());
      await refreshWorkspace();
      if (!mounted.current) return;
      if (
        action === "compose" &&
        latestDraft.current.settingsSnapshot === settingsSnapshot
      ) {
        clearMode();
        clearReadingWpm();
        clearImageId();
        clearImageDim();
        clearImagePosition();
        clearMusicId();
        clearMusicVolume();
        clearMusicLoop();
        clearMusicFade();
        clearBackground();
        clearVolume();
      }
      if (action === "timing" && latestDraft.current.timing === timing) {
        setTiming(null);
        clearTiming();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  async function upload() {
    if (!uploadFile) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", uploadFile);
      form.set("kind", uploadKind);
      form.set("name", uploadName || uploadFile.name);
      form.set("provenance", provenance);
      const response = await fetch("/api/assets", {
        method: "POST",
        body: form,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      const fresh = await fetch(`/api/episodes/${state.episode.id}/media`);
      if (!fresh.ok) throw new Error("Could not refresh the asset library");
      setState(await fresh.json());
      await refreshWorkspace();
      if (!mounted.current) return;
      if (uploadKind === "image") setImageId(result.id);
      else setMusicId(result.id);
      if (
        latestDraft.current.uploadFile === uploadFile &&
        latestDraft.current.uploadKind === uploadKind &&
        latestDraft.current.uploadName === uploadName &&
        latestDraft.current.provenance === provenance
      ) {
        setUploadFile(null);
        setUploadName("");
        setProvenance("");
        clearUploadFile();
        clearUploadName();
        clearProvenance();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }
  async function loadVoices() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
        `/api/episodes/${state.episode.id}/media?voices=elevenlabs`,
      );
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      if (!mounted.current) return;
      setVoices(result);
      setVoice(
        result.voices.some(
          (item: Voices["voices"][number]) => item.voice_id === voice,
        )
          ? voice
          : result.voices[0]?.voice_id || "",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Voices unavailable");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {error && (
        <div className="status-message error" role="alert">
          {error.replaceAll("_", " ")}
        </div>
      )}
      <div className="media-grid">
        <section className="panel media-controls">
          {section === "voice" && (
            <>
              <h2>Voice & captions</h2>
              {!script && (
                <p className="status-message">
                  Save a script to generate narration or reading cards.{" "}
                  <Link href={`/episodes/${state.episode.id}/script`}>
                    Open script & sources
                  </Link>
                  .
                </p>
              )}
              <label>
                Video style
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as typeof mode)}
                >
                  <option value="narrated">Narration & captions</option>
                  <option value="text">
                    Text & background music · no voiceover
                  </option>
                </select>
              </label>
              {mode === "text" && (
                <>
                  <p className="muted">
                    Your saved script becomes reading cards. Quotations keep
                    their wording and source. No voice generation is needed.
                  </p>
                  <label>
                    Reading speed · {readingWpm} words/minute
                    <input
                      aria-label="Reading speed"
                      type="range"
                      min="70"
                      max="180"
                      step="5"
                      value={readingWpm}
                      onChange={(e) => setReadingWpm(Number(e.target.value))}
                    />
                  </label>
                </>
              )}
              {mode === "narrated" && (
                <>
                  <h3>Narration</h3>
                  <p className="muted">
                    Private draft ·{" "}
                    {script?.reviewState === "reviewed"
                      ? "Script reviewed"
                      : "Creator review pending"}
                    . Publication rights are not yet cleared.
                  </p>
                  <label>
                    Review workflow
                    <select
                      value={reviewMode}
                      onChange={(e) =>
                        setReviewMode(e.target.value as typeof reviewMode)
                      }
                    >
                      <option value="consolidated">
                        Review the complete draft together
                      </option>
                      <option value="stages">
                        Review each stage before continuing
                      </option>
                    </select>
                  </label>
                  <p>
                    Saved provider:{" "}
                    <strong>{state.episode.narrationProvider}</strong>.
                  </p>
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => void loadVoices()}
                  >
                    Check ElevenLabs credits & voices
                  </button>
                  {voices && (
                    <>
                      <p>
                        {voices.account.remaining.toLocaleString()} included
                        characters available · {voices.account.tier} plan
                        {!voices.account.commercial
                          ? " · noncommercial audition only"
                          : ""}
                        .
                      </p>
                      <label>
                        Voice
                        <select
                          value={voice}
                          onChange={(e) => setVoice(e.target.value)}
                        >
                          {voices.voices.map((v) => (
                            <option key={v.voice_id} value={v.voice_id}>
                              {v.name}
                              {v.labels?.gender ? ` · ${v.labels.gender}` : ""}
                              {v.labels?.description
                                ? ` · ${v.labels.description}`
                                : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      {voices.voices.find((v) => v.voice_id === voice)
                        ?.preview_url && (
                        <audio
                          controls
                          preload="none"
                          src={
                            voices.voices.find((v) => v.voice_id === voice)
                              ?.preview_url || undefined
                          }
                        />
                      )}
                      <label>
                        Pace · {speed.toFixed(2)}×
                        <input
                          aria-label="Narration pace"
                          type="range"
                          min="0.7"
                          max="1.2"
                          step="0.05"
                          value={speed}
                          onChange={(e) => setSpeed(Number(e.target.value))}
                        />
                      </label>
                      {!["auto", "elevenlabs"].includes(
                        state.episode.narrationProvider,
                      ) && (
                        <label className="check-label">
                          <input
                            type="checkbox"
                            checked={override}
                            onChange={(e) => setOverride(e.target.checked)}
                          />
                          Use ElevenLabs instead of{" "}
                          {state.episode.narrationProvider} for this take.
                        </label>
                      )}
                      <button
                        className="primary-button"
                        disabled={
                          busy ||
                          active ||
                          !voice ||
                          !script ||
                          (!["auto", "elevenlabs"].includes(
                            state.episode.narrationProvider,
                          ) &&
                            !override) ||
                          (reviewMode === "stages" &&
                            script?.reviewState !== "reviewed")
                        }
                        onClick={() =>
                          void act("narrate", {
                            scriptId: script?.id,
                            provider: "elevenlabs",
                            voiceId: voice,
                            settings: {
                              speed,
                              stability: 0.65,
                              similarity_boost: 0.75,
                            },
                            purpose: "audition",
                            reviewMode,
                            providerOverride: override,
                          })
                        }
                      >
                        Generate private narration
                      </button>
                    </>
                  )}
                  <p className="muted">
                    Cartesia and Deepgram generation need verified quota
                    connections. No automatic provider switch or paid fallback.
                  </p>
                  {take && (
                    <div className="take-player">
                      <h3>
                        {take.voiceName} · {Math.round(take.duration)} seconds
                      </h3>
                      <audio controls preload="metadata" src={take.audioUrl} />
                      <p className="muted">
                        Listen through, especially the quotation and
                        pronunciation.
                      </p>
                    </div>
                  )}
                </>
              )}
              {mode === "narrated" && (
                <label>
                  Narration volume · {Math.round(volume * 100)}%
                  <input
                    aria-label="Narration volume"
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.05"
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                  />
                </label>
              )}
              {track && mode === "narrated" && (
                <section className="caption-editor">
                  <h2>Caption timing</h2>
                  <p>
                    Adjust the start and end of each phrase against the audio.
                    Words stay tied to the saved script.
                  </p>
                  <div className="caption-scroll">
                    {cues.map((c, i) => (
                      <div className="caption-row" key={i}>
                        <span>{i + 1}</span>
                        <label>
                          <span className="sr-only">Caption {i + 1} start</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={c.start}
                            onChange={(e) =>
                              setTiming({
                                id: track.id,
                                cues: cues.map((cue, index) =>
                                  index === i
                                    ? { ...cue, start: Number(e.target.value) }
                                    : cue,
                                ),
                              })
                            }
                          />
                        </label>
                        <label>
                          <span className="sr-only">Caption {i + 1} end</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={c.end}
                            onChange={(e) =>
                              setTiming({
                                id: track.id,
                                cues: cues.map((cue, index) =>
                                  index === i
                                    ? { ...cue, end: Number(e.target.value) }
                                    : cue,
                                ),
                              })
                            }
                          />
                        </label>
                        <span>
                          {c.text}
                          {c.kind === "quote" && (
                            <small>Qur’an {c.reference}</small>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                  <button
                    className="secondary-button"
                    disabled={busy || !timing}
                    onClick={() =>
                      void act("timing", {
                        voiceTakeId: take!.id,
                        parentId: track.id,
                        changes: cues.map((c) => ({
                          start: c.start,
                          end: c.end,
                        })),
                      })
                    }
                  >
                    Save timing revision
                  </button>
                </section>
              )}
            </>
          )}
          {section === "background" && (
            <>
              <h2>Backgrounds</h2>
              <p className="muted">
                Choose a color, or bring an image or GIF from your library.
              </p>
              <label>
                Background
                <select
                  value={background}
                  onChange={(e) =>
                    setBackground(e.target.value as typeof background)
                  }
                >
                  <option value="forest">Forest light</option>
                  <option value="dusk">Quiet dusk</option>
                  <option value="sand">Warm sand</option>
                </select>
              </label>
              <label>
                Background image or GIF
                <select
                  value={imageId}
                  onChange={(e) => setImageId(e.target.value)}
                >
                  <option value="">Use the color background</option>
                  {state.assets
                    .filter((a) => a.kind === "image")
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </label>
              {imageId && (
                <>
                  <label>
                    Image darkness · {Math.round(imageDim * 100)}%
                    <input
                      aria-label="Image darkness"
                      type="range"
                      min="0.2"
                      max="0.85"
                      step="0.05"
                      value={imageDim}
                      onChange={(e) => setImageDim(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Image framing · {imagePosition}%
                    <input
                      aria-label="Image framing"
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={imagePosition}
                      onChange={(e) => setImagePosition(Number(e.target.value))}
                    />
                  </label>
                  <p className="muted">
                    Move the crop left or right; check the vertical preview for
                    the best framing.
                  </p>
                </>
              )}
            </>
          )}
          {section === "music" && (
            <>
              <h2>Music</h2>
              <p className="muted">
                Choose a track and shape the mix for the whole video.
              </p>
              <label>
                Background music
                <select
                  value={musicId}
                  onChange={(e) => setMusicId(e.target.value)}
                >
                  <option value="">None · silence</option>
                  {state.assets
                    .filter((a) => a.kind === "audio")
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </label>
              {musicId && (
                <>
                  <audio
                    aria-label="Preview background music"
                    controls
                    preload="none"
                    src={`/api/assets/${musicId}`}
                  />
                  <label>
                    Music volume · {Math.round(musicVolume * 100)}%
                    <input
                      aria-label="Music volume"
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={musicVolume}
                      onChange={(e) => setMusicVolume(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Music fade · {musicFade} seconds
                    <input
                      aria-label="Music fade"
                      type="range"
                      min="0"
                      max="10"
                      step="0.5"
                      value={musicFade}
                      onChange={(e) => setMusicFade(Number(e.target.value))}
                    />
                  </label>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={musicLoop}
                      onChange={(e) => setMusicLoop(e.target.checked)}
                    />
                    Loop music for the whole video
                  </label>
                </>
              )}
            </>
          )}
          {(section === "music" || section === "background") && (
            <>
              <details className="asset-upload">
                <summary>Add your own background or track</summary>
                <label>
                  Asset type
                  <select
                    value={uploadKind}
                    onChange={(e) => {
                      setUploadKind(e.target.value as typeof uploadKind);
                      setUploadFile(null);
                    }}
                  >
                    <option value="image">Image or GIF</option>
                    <option value="audio">Background audio</option>
                  </select>
                </label>
                <label>
                  Choose a file
                  <input
                    key={`${uploadKind}-${uploadFile ? "selected" : "empty"}`}
                    type="file"
                    accept={
                      uploadKind === "image"
                        ? "image/jpeg,image/png,image/webp,image/gif"
                        : "audio/mpeg,audio/wav,audio/mp4,.m4a"
                    }
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  />
                </label>
                {uploadFile && (
                  <p className="muted">Selected: {uploadFile.name}</p>
                )}
                <label>
                  Library name
                  <input
                    maxLength={100}
                    value={uploadName}
                    onChange={(e) => setUploadName(e.target.value)}
                    placeholder="A quiet morning"
                  />
                </label>
                <label>
                  Source & credit (optional)
                  <textarea
                    maxLength={1000}
                    value={provenance}
                    onChange={(e) => setProvenance(e.target.value)}
                    placeholder="Your own work, or the creator, source and license details"
                  />
                </label>
                <p className="muted">
                  JPEG, PNG, WebP, GIF · MP3, WAV, M4A · up to 30 MB. GIFs: up
                  to 30 seconds; use a smaller size for longer animations.
                  Credits are included in the exported description.
                </p>
                <button
                  className="secondary-button"
                  disabled={busy || !uploadFile}
                  onClick={() => void upload()}
                >
                  Add to library
                </button>
              </details>
            </>
          )}
          {section === "video" && (
            <>
              <h2>Video</h2>
              <p>
                Review your saved composition in landscape or vertical, then
                save a new revision when your settings are ready.
              </p>
              <dl className="video-summary">
                <div>
                  <dt>Words</dt>
                  <dd>{script ? "Saved script available" : "No script yet"}</dd>
                </div>
                <div>
                  <dt>Style</dt>
                  <dd>
                    {mode === "text"
                      ? "Text reading cards"
                      : "Narration & captions"}
                  </dd>
                </div>
                <div>
                  <dt>Background</dt>
                  <dd>
                    {state.assets.find((asset) => asset.id === imageId)?.name ||
                      background}
                  </dd>
                </div>
                <div>
                  <dt>Music</dt>
                  <dd>
                    {state.assets.find((asset) => asset.id === musicId)?.name ||
                      "None · silence"}
                  </dd>
                </div>
              </dl>
              <p className="muted">
                Use Voice & captions, Music, and Backgrounds to adjust the
                video. The preview shows the saved revision.
              </p>
            </>
          )}
          {section === "exports" && (
            <>
              <h2>Exports</h2>
              <p>
                Render the saved composition as landscape and vertical MP4s,
                with captions and a source description.
              </p>
              {(!composition || composition.stale) && (
                <p className="status-message">
                  Save an up-to-date preview revision before rendering a new
                  export. Earlier downloads remain available below.
                </p>
              )}
              {composition && (
                <button
                  className="primary-button"
                  disabled={
                    busy ||
                    active ||
                    composition.stale ||
                    settingsDirty ||
                    Boolean(timing)
                  }
                  onClick={() =>
                    void act("render", { compositionId: composition.id })
                  }
                >
                  Render both draft videos
                </button>
              )}
              {(settingsDirty || timing) && (
                <p className="muted">
                  Save your settings and caption timing before rendering.
                </p>
              )}
              {state.exports.length === 0 && (
                <p className="muted">
                  No exports yet. Your completed files will appear here.
                </p>
              )}
              {output && (
                <div className="export-links">
                  <h3>Your draft files</h3>
                  {(
                    ["landscape", "vertical", "srt", "description"] as const
                  ).map((format) => (
                    <a
                      key={format}
                      href={`/api/exports/${output.id}?format=${format}&download=1`}
                    >
                      {format === "srt"
                        ? "Captions (SRT)"
                        : format === "description"
                          ? "Source description"
                          : `${format === "landscape" ? "Landscape" : "Vertical"} MP4`}
                    </a>
                  ))}
                  <p className="muted">
                    Private review copies. Source reuse, narration rights, and
                    creator approval are still required for publication.
                  </p>
                </div>
              )}
              {state.exports.length > 0 && (
                <section className="export-history">
                  <h3>Export history · {state.exports.length}</h3>
                  <p className="muted">
                    Each download keeps the picture, sound, and words from its
                    saved revision.
                  </p>
                  {state.exports.map((e) => {
                    const c = state.compositions.find(
                      (candidate) => candidate.id === e.compositionId,
                    );
                    return (
                      <div key={e.id} className="export-links">
                        <strong>
                          {c?.data.mode === "text" ? "Text only" : "Narrated"} ·{" "}
                          {c?.data.image?.name || c?.data.background} ·{" "}
                          {new Date(e.createdAt).toLocaleString()}
                        </strong>
                        <a
                          href={`/api/exports/${e.id}?format=landscape&download=1`}
                        >
                          Landscape MP4
                        </a>
                        <a
                          href={`/api/exports/${e.id}?format=vertical&download=1`}
                        >
                          Vertical MP4
                        </a>
                        <a href={`/api/exports/${e.id}?format=srt&download=1`}>
                          Captions (SRT)
                        </a>
                        <a
                          href={`/api/exports/${e.id}?format=description&download=1`}
                        >
                          Source description
                        </a>
                      </div>
                    );
                  })}
                </section>
              )}
            </>
          )}
        </section>
        <section className="panel media-preview">
          <div className="preview-heading">
            <h2>Your preview</h2>
            <div className="format-toggle">
              <button
                aria-pressed={!vertical}
                onClick={() => setVertical(false)}
              >
                Landscape
              </button>
              <button aria-pressed={vertical} onClick={() => setVertical(true)}>
                Vertical
              </button>
            </div>
          </div>
          {settingsDirty && (
            <p className="status-message" role="status">
              Settings changed. Save a preview revision to update the picture
              and sound.
            </p>
          )}
          {preview ? (
            <>
              {preview.stale && (
                <p className="status-message">
                  This saved preview is outdated. Update the script, narration,
                  or timing as needed and save a new revision.
                </p>
              )}
              <div
                className={vertical ? "film-player vertical" : "film-player"}
              >
                <Player
                  key={`${preview.id}-${vertical}`}
                  component={EpisodeFilm}
                  inputProps={{ data: preview.data }}
                  durationInFrames={Math.ceil(preview.data.duration * 30)}
                  compositionWidth={vertical ? 1080 : 1920}
                  compositionHeight={vertical ? 1920 : 1080}
                  fps={30}
                  controls
                  style={{ width: "100%" }}
                />
              </div>
              <p className="muted">
                Saved revision ·{" "}
                {preview.data.mode === "text" ? "Text only" : "Narrated"} ·{" "}
                {preview.data.image?.name || preview.data.background} ·{" "}
                {preview.data.duration.toFixed(1)} seconds. Both exports use
                this composition.
              </p>
            </>
          ) : (
            <div className="empty-state">
              <p>
                {take
                  ? "Your saved preview needs updating. Save a preview revision with the current narration and caption timing."
                  : "Choose narration or text-only, then save a preview revision to see your film here."}
              </p>
            </div>
          )}
          <div className="preview-save">
            {!script ? (
              <p className="muted">
                Start by{" "}
                <Link href={`/episodes/${state.episode.id}/script`}>
                  saving a script
                </Link>
                . You can choose and upload media now.
              </p>
            ) : mode === "narrated" && (!take || !track) ? (
              <p className="muted">
                Generate narration in Voice & captions, or choose text-only
                reading cards, before saving a preview.
              </p>
            ) : timing ? (
              <p className="muted">
                Save your caption timing before saving a preview revision.
              </p>
            ) : (
              <p className="muted">
                Save a revision to apply these settings to the preview and next
                export.
              </p>
            )}
            <button
              className="primary-button"
              disabled={
                busy ||
                !script ||
                (mode === "narrated" && (!take || !track || Boolean(timing)))
              }
              onClick={() =>
                void act("compose", {
                  scriptId: script?.id,
                  voiceTakeId: mode === "narrated" ? take!.id : null,
                  captionTrackId: mode === "narrated" ? track!.id : null,
                  mode,
                  readingWpm,
                  imageId: imageId || null,
                  imageDim,
                  imagePosition,
                  musicId: musicId || null,
                  musicVolume,
                  musicLoop,
                  musicFade,
                  background,
                  narrationVolume: volume,
                })
              }
            >
              Save preview revision
            </button>
          </div>
        </section>
      </div>
      <section className="panel job-panel">
        <h2>Recent work</h2>
        <p className="muted">
          Generation and rendering continue while you work. Completed jobs
          update this workspace.
        </p>
        {state.jobs.length === 0 && (
          <p className="muted">No generation or render jobs yet.</p>
        )}
        {state.jobs.slice(0, 6).map((j) => (
          <div key={j.id} className="job-row">
            <strong>{j.kind}</strong>
            <span>
              {j.status} · {j.progress}
            </span>
            {j.error && (
              <span role="alert">{j.error.replaceAll("_", " ")}</span>
            )}
            {j.status === "failed" && (
              <button
                disabled={busy}
                onClick={() => void act("retry", { jobId: j.id })}
              >
                Retry
              </button>
            )}
          </div>
        ))}
      </section>
    </>
  );
}
