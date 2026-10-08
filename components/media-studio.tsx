"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  useEpisodeWorkspace,
  useWorkspaceDraft,
  useWorkspaceBuffer,
} from "./episode-workspace";
import { Player, type PlayerRef } from "@remotion/player";
import { SceneEditor } from "./scene-editor";
import { ExportsPanel } from "./exports-panel";
import {
  editorSettingsSchema,
  editorSettingsKey,
  defaultEditorSettings,
  retimeReadingCues,
  splitCue,
  mergeCue,
  type EditorSettings,
} from "@/lib/domain/scene-settings";
import {
  readingCues,
  compositionSchema,
  type CompositionData,
} from "@/lib/domain/media";
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
  const saved = initial.compositions.find(
    (item) => item.id === initial.selectedCompositionId,
  )?.data;
  function settingsFor(data?: CompositionData): EditorSettings {
    if (data?.editorSettings)
      return editorSettingsSchema.parse(data.editorSettings);
    const defaults = defaultEditorSettings();
    return {
      ...defaults,
      openingSeconds: data?.mode === "text" ? 0.5 : 0,
      musicFadeIn: data?.musicFade ?? 3,
      musicFadeOut: data?.musicFade ?? 3,
      framing: {
        landscape: { x: data?.imagePosition ?? 50, y: 50, zoom: 1 },
        vertical: { x: data?.imagePosition ?? 50, y: 50, zoom: 1 },
      },
    };
  }
  const [editorSettings, setEditorSettings, clearEditorSettings] =
    useWorkspaceBuffer<EditorSettings>(
      "media:editorSettings",
      settingsFor(saved),
    );
  const playerRef = useRef<PlayerRef>(null);
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
  const [stability, setStability] = useWorkspaceBuffer("media:stability", 0.65);
  const [similarity, setSimilarity] = useWorkspaceBuffer(
    "media:similarity",
    0.75,
  );
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
  const [reviewDirty, setReviewDirty] = useState(false);
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
    editorSettings,
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
  const script =
      state.scripts.find((item) => item.id === state.selectedScriptId) ||
      state.scripts[0],
    take = state.takes.find((t) => t.id === state.selectedVoiceTakeId),
    selectedTrack = state.tracks.find(
      (t) => t.id === state.selectedCaptionTrackId,
    ),
    track = selectedTrack?.voiceTakeId === take?.id ? selectedTrack : undefined,
    composition = state.compositions.find(
      (item) => item.id === state.selectedCompositionId,
    );
  const takeHistory = state.takes.filter(
    (item) => item.scriptId === script?.id,
  );
  const captionHistory = state.tracks.filter(
    (item) => item.voiceTakeId === take?.id,
  );
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
    (baseline?.readingWpm ?? 110) !== readingWpm ||
    editorSettingsKey(settingsFor(baseline)) !==
      editorSettingsKey(editorSettings);
  const narrationSetupDirty =
    mode === "narrated" &&
    (voice !== "" ||
      override ||
      speed !== 1 ||
      stability !== 0.65 ||
      similarity !== 0.75 ||
      reviewMode !== "consolidated");
  useWorkspaceDraft({
    dirty:
      settingsDirty ||
      narrationSetupDirty ||
      Boolean(timing) ||
      Boolean(uploadFile || uploadName || provenance) ||
      (section === "exports" && reviewDirty),
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
  function applyCompositionSettings(
    data: MediaState["compositions"][number]["data"],
  ) {
    setMode(data.mode || "narrated");
    setReadingWpm(data.readingWpm || 110);
    setImageId(data.image?.id || "");
    setImageDim(data.imageDim ?? 0.45);
    setImagePosition(data.imagePosition ?? 50);
    setMusicId(data.music?.id || "");
    setMusicVolume(data.musicVolume ?? 0.2);
    setMusicLoop(data.musicLoop ?? true);
    setMusicFade(data.musicFade ?? 3);
    setBackground(data.background);
    setVolume(data.narrationVolume ?? 1);
    setEditorSettings(settingsFor(data));
  }
  let liveData: CompositionData | undefined;
  let previewError = "";
  try {
    if (
      script &&
      (mode === "text" || (take && track && !take.stale && !track.stale))
    ) {
      const liveCues =
        mode === "text"
          ? retimeReadingCues(
              readingCues(script.blocks, readingWpm),
              editorSettings,
            )
          : cues.map((c) => ({
              ...c,
              start: c.start + editorSettings.openingSeconds,
              end: c.end + editorSettings.openingSeconds,
            }));
      const assetSnapshot = (id: string) => {
        const a = state.assets.find((item) => item.id === id);
        return a
          ? {
              id: a.id,
              url: a.url,
              checksum: a.checksum,
              name: a.name,
              provenance: a.provenance,
              mime: a.mime,
              width: a.width,
              height: a.height,
            }
          : null;
      };
      const music = state.assets.find(
        (a) => a.id === musicId && a.kind === "audio",
      );
      liveData = compositionSchema.parse({
        version: 3,
        title: script.title,
        scriptChecksum: script.checksum,
        voiceChecksum: baseline?.voiceChecksum || "",
        captionChecksum: baseline?.captionChecksum || "",
        duration:
          (mode === "text"
            ? liveCues[liveCues.length - 1].end
            : take!.duration + editorSettings.openingSeconds) +
          editorSettings.closingSeconds,
        fps: 30,
        cues: liveCues,
        audioUrl: mode === "narrated" ? take!.audioUrl : "",
        audioOffset: mode === "narrated" ? editorSettings.openingSeconds : 0,
        background,
        ambience: "none",
        ambienceVolume: 0,
        narrationVolume: volume,
        mode,
        readingWpm,
        image: imageId ? assetSnapshot(imageId) : null,
        imageDim,
        imagePosition,
        music: music
          ? { ...assetSnapshot(music.id), duration: music.duration }
          : null,
        musicVolume,
        musicLoop,
        musicFade,
        editorSettings,
        sceneImages: editorSettings.sceneOverrides
          .filter((s) => s.imageId !== undefined)
          .map((s) => ({
            cueIndex: s.cueIndex,
            image: s.imageId ? assetSnapshot(s.imageId) : null,
          })),
        draft: true,
        attribution:
          baseline?.attribution ||
          "Original reflection · Sources attributed on screen",
      });
    }
  } catch {
    previewError =
      "Check reading durations and media settings before previewing or saving.";
  }
  if (!settingsDirty && !timing && preview && !preview.stale)
    liveData = preview.data;
  const timelineCues = liveData?.cues || preview?.data.cues || [];
  const previewDirty =
    settingsDirty || Boolean(timing) || !preview || preview.stale;
  function seekPreview(seconds: number) {
    const cue = timelineCues.find(
      (item) => Math.abs(item.start - seconds) < 0.001,
    );
    // Seek into the fade so a paused scene selection shows its words immediately.
    const offset = cue ? Math.min(0.12, (cue.end - cue.start) / 2) : 0;
    playerRef.current?.seekTo(Math.round((seconds + offset) * 30));
  }
  async function refreshMedia() {
    setBusy(true);
    try {
      const response = await fetch(`/api/episodes/${state.episode.id}/media`);
      if (!response.ok) throw new Error("Could not refresh studio");
      const next: MediaState = await response.json();
      setState(next);
      if (!settingsDirty && !timing) {
        const selected = next.compositions.find(
          (item) => item.id === next.selectedCompositionId,
        );
        if (selected) applyCompositionSettings(selected.data);
      }
      setError("");
      await refreshWorkspace();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  }
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
      const next: MediaState = await fresh.json();
      setState(next);
      await refreshWorkspace();
      if (!mounted.current) return;
      if (action === "selectComposition") {
        const selected = next.compositions.find(
          (item) => item.id === next.selectedCompositionId,
        );
        if (selected) applyCompositionSettings(selected.data);
      }
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
        clearEditorSettings();
      }
      if (action === "timing") {
        const newerTiming = latestDraft.current.timing;
        if (newerTiming === timing) {
          setTiming(null);
          clearTiming();
        } else if (newerTiming && next.selectedCaptionTrackId)
          setTiming({ ...newerTiming, id: next.selectedCaptionTrackId });
        const normalize = (items: Cue[]) =>
          items.map((c) => c.text.trim().split(/\s+/).join(" ")).join("|cue|");
        const boundariesChanged =
          timing && normalize(timing.cues) !== normalize(track?.cues || []);
        if (
          boundariesChanged &&
          latestDraft.current.settingsSnapshot === settingsSnapshot
        )
          setEditorSettings({
            ...editorSettings,
            sceneOverrides: [],
            cardDurations: [],
          });
      }
      if (action === "selectVoice" || action === "selectCaption") {
        setEditorSettings({
          ...editorSettings,
          sceneOverrides: [],
          cardDurations: [],
        });
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
          <span>{error.replaceAll("_", " ")}</span>
          <button disabled={busy} onClick={() => void refreshMedia()}>
            Refresh media history
          </button>
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
                      onChange={(e) => {
                        setReadingWpm(Number(e.target.value));
                        setEditorSettings({
                          ...editorSettings,
                          cardDurations: [],
                          sceneOverrides: [],
                        });
                      }}
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
                      <label>
                        Delivery steadiness · {Math.round(stability * 100)}%
                        <input
                          aria-label="Delivery steadiness"
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={stability}
                          onChange={(e) => setStability(Number(e.target.value))}
                        />
                      </label>
                      <label>
                        Voice similarity · {Math.round(similarity * 100)}%
                        <input
                          aria-label="Voice similarity"
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={similarity}
                          onChange={(e) =>
                            setSimilarity(Number(e.target.value))
                          }
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
                              stability,
                              similarity_boost: similarity,
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
                        Selected take · {take.voiceName} ·{" "}
                        {Math.round(take.duration)} seconds
                      </h3>
                      <audio controls preload="metadata" src={take.audioUrl} />
                      <p className="muted">
                        {take.stale
                          ? "This take belongs to an earlier script selection. Choose a take for the selected script or generate another."
                          : "Listen through, especially the quotation and pronunciation."}
                      </p>
                    </div>
                  )}
                  {takeHistory.length > 0 && (
                    <section
                      className="media-history"
                      aria-label="Voice take history"
                    >
                      <div className="media-history-heading">
                        <h3>Voice take history</h3>
                        <span>{takeHistory.length} takes</span>
                      </div>
                      {takeHistory.map((item) => (
                        <div className="media-history-row" key={item.id}>
                          <div>
                            <strong>{item.voiceName}</strong>
                            {item.id === state.selectedVoiceTakeId && (
                              <span className="selected-pill">Selected</span>
                            )}
                            <small>
                              {item.provider} · {item.model} ·{" "}
                              {Math.round(item.duration)} seconds ·{" "}
                              {new Date(item.createdAt).toLocaleString()}
                            </small>
                          </div>
                          <button
                            className="text-link"
                            disabled={
                              busy ||
                              Boolean(timing) ||
                              item.id === state.selectedVoiceTakeId
                            }
                            onClick={() =>
                              void act("selectVoice", {
                                voiceTakeId: item.id,
                                selectionRevision: state.selectionRevision,
                              })
                            }
                          >
                            Use this take
                          </button>
                        </div>
                      ))}
                    </section>
                  )}
                  {take && captionHistory.length > 0 && (
                    <section
                      className="media-history"
                      aria-label="Caption timing history"
                    >
                      <div className="media-history-heading">
                        <h3>Caption timing history</h3>
                        <span>{captionHistory.length} revisions</span>
                      </div>
                      {captionHistory.map((item, index) => (
                        <div className="media-history-row" key={item.id}>
                          <div>
                            <strong>
                              Timing {captionHistory.length - index}
                            </strong>
                            {item.id === state.selectedCaptionTrackId && (
                              <span className="selected-pill">Selected</span>
                            )}
                            <small>
                              {item.cues.length} phrases ·{" "}
                              {new Date(item.createdAt).toLocaleString()}
                            </small>
                          </div>
                          <button
                            className="text-link"
                            disabled={
                              busy ||
                              Boolean(timing) ||
                              item.id === state.selectedCaptionTrackId
                            }
                            onClick={() =>
                              void act("selectCaption", {
                                captionTrackId: item.id,
                                selectionRevision: state.selectionRevision,
                              })
                            }
                          >
                            Use this timing
                          </button>
                        </div>
                      ))}
                    </section>
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
                          <button
                            type="button"
                            className="text-link"
                            onClick={() =>
                              seekPreview(
                                c.start + editorSettings.openingSeconds,
                              )
                            }
                          >
                            {c.text}
                          </button>
                          {c.kind === "quote" && (
                            <small>
                              {c.sourceKind === "hadith" ? "Hadith" : "Qur’an"}{" "}
                              {c.reference}
                            </small>
                          )}
                          <label>
                            Line breaks
                            <textarea
                              aria-label={`Caption ${i + 1} line breaks`}
                              value={c.text}
                              maxLength={300}
                              onChange={(e) => {
                                const value = e.target.value;
                                if (value.split(/\r?\n/).length > 6) {
                                  setError("Use six caption lines or fewer.");
                                  return;
                                }
                                if (
                                  value.trim().split(/\s+/).join(" ") ===
                                  c.text.trim().split(/\s+/).join(" ")
                                )
                                  setTiming({
                                    id: track.id,
                                    cues: cues.map((item, n) =>
                                      n === i ? { ...item, text: value } : item,
                                    ),
                                  });
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            disabled={c.text.trim().split(/\s+/).length < 2}
                            onClick={() => {
                              try {
                                setTiming({
                                  id: track.id,
                                  cues: splitCue(
                                    cues,
                                    i,
                                    Math.ceil(
                                      c.text.trim().split(/\s+/).length / 2,
                                    ),
                                  ),
                                });
                              } catch (e) {
                                setError(
                                  e instanceof Error
                                    ? e.message
                                    : "Cannot split caption",
                                );
                              }
                            }}
                          >
                            Split phrase
                          </button>
                          <button
                            type="button"
                            disabled={i === cues.length - 1}
                            onClick={() => {
                              try {
                                setTiming({
                                  id: track.id,
                                  cues: mergeCue(cues, i),
                                });
                              } catch (e) {
                                setError(
                                  e instanceof Error
                                    ? e.message
                                    : "Cannot merge captions",
                                );
                              }
                            }}
                          >
                            Merge with next
                          </button>
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
                        selectionRevision: state.selectionRevision,
                        editedCues: cues,
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
              <section aria-label="Media library" className="asset-library">
                {state.assets
                  .filter(
                    (a) => a.kind === (section === "music" ? "audio" : "image"),
                  )
                  .map((a) => (
                    <article key={a.id}>
                      {a.kind === "image" ? (
                        <Image
                          src={a.url}
                          width={160}
                          height={90}
                          unoptimized
                          alt={a.name}
                        />
                      ) : (
                        <audio
                          controls
                          preload="none"
                          src={a.url}
                          aria-label={`Preview ${a.name}`}
                        />
                      )}
                      <button
                        type="button"
                        className="text-link"
                        onClick={() =>
                          a.kind === "image"
                            ? setImageId(a.id)
                            : setMusicId(a.id)
                        }
                      >
                        {a.name}
                      </button>
                      <p className="muted">
                        {a.provenance || "No source notes recorded"}
                      </p>
                    </article>
                  ))}
              </section>
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
                video. Changes appear immediately; save a revision for export.
              </p>
            </>
          )}
          {section !== "exports" && (
            <SceneEditor
              settings={editorSettings}
              onChange={setEditorSettings}
              cues={timelineCues}
              assets={state.assets}
              mode={mode}
              section={section}
              vertical={vertical}
              busy={busy}
              onSeek={seekPreview}
            />
          )}
          {section === "exports" && (
            <ExportsPanel
              state={state}
              busy={busy}
              dirty={settingsDirty || Boolean(timing)}
              onDirtyChange={setReviewDirty}
              onAction={act}
            />
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
          {previewDirty && (
            <p className="status-message" role="status">
              Unsaved preview · Save a revision before rendering these changes.
            </p>
          )}
          {previewError && (
            <p role="alert" className="status-message">
              {previewError}
            </p>
          )}
          {liveData ? (
            <>
              {preview?.stale && (
                <p className="status-message">
                  This saved preview is outdated. Update the script, narration,
                  or timing as needed and save a new revision.
                </p>
              )}
              <div
                className={vertical ? "film-player vertical" : "film-player"}
              >
                <Player
                  key={`${script?.id}-${vertical}`}
                  ref={playerRef}
                  component={EpisodeFilm}
                  inputProps={{ data: liveData }}
                  durationInFrames={Math.ceil(liveData.duration * 30)}
                  compositionWidth={vertical ? 1080 : 1920}
                  compositionHeight={vertical ? 1920 : 1080}
                  fps={30}
                  controls
                  style={{ width: "100%" }}
                />
              </div>
              <p className="muted">
                {previewDirty ? "Unsaved preview" : "Saved settings"} ·{" "}
                {liveData.mode === "text" ? "Text only" : "Narrated"} ·{" "}
                {liveData.image?.name || liveData.background} ·{" "}
                {liveData.duration.toFixed(1)} seconds. Both exports use this
                composition.
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
            ) : mode === "narrated" &&
              (!take || !track || take.stale || track.stale) ? (
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
                Boolean(previewError) ||
                (section === "exports" && reviewDirty) ||
                !script ||
                (mode === "narrated" &&
                  (!take ||
                    !track ||
                    take.stale ||
                    track.stale ||
                    Boolean(timing)))
              }
              onClick={() =>
                void act("compose", {
                  selectionRevision: state.selectionRevision,
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
                  editorSettings,
                })
              }
            >
              Save preview revision
            </button>
          </div>
          {state.compositions.length > 0 && (
            <section className="media-history composition-history">
              <div className="media-history-heading">
                <h3>Preview history</h3>
                <span>{state.compositions.length} revisions</span>
              </div>
              {state.compositions.map((item, index) => (
                <div className="media-history-row" key={item.id}>
                  <div>
                    <strong>
                      Preview {state.compositions.length - index} ·{" "}
                      {item.data.mode === "text" ? "Text only" : "Narrated"}
                    </strong>
                    {item.id === state.selectedCompositionId && (
                      <span className="selected-pill">Selected</span>
                    )}
                    <small>
                      {item.data.image?.name || item.data.background} ·{" "}
                      {item.data.duration.toFixed(1)} seconds ·{" "}
                      {new Date(item.createdAt).toLocaleString()}
                      {item.stale ? " · Dependencies changed" : ""}
                    </small>
                  </div>
                  <button
                    className="text-link"
                    disabled={
                      busy ||
                      settingsDirty ||
                      Boolean(timing) ||
                      (section === "exports" && reviewDirty) ||
                      item.id === state.selectedCompositionId
                    }
                    onClick={() =>
                      void act("selectComposition", {
                        compositionId: item.id,
                        selectionRevision: state.selectionRevision,
                      })
                    }
                  >
                    Use this preview
                  </button>
                </div>
              ))}
            </section>
          )}
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
