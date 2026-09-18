export type WorkspaceSection =
  | "idea"
  | "script"
  | "voice"
  | "music"
  | "background"
  | "video"
  | "exports";

export const WORKSPACE_SECTIONS = [
  { id: "idea", label: "Idea" },
  { id: "script", label: "Script & sources" },
  { id: "voice", label: "Voice & captions" },
  { id: "music", label: "Music" },
  { id: "background", label: "Backgrounds" },
  { id: "video", label: "Video" },
  { id: "exports", label: "Exports" },
] as const satisfies readonly { id: WorkspaceSection; label: string }[];

export function workspaceHref(episodeId: string, section: WorkspaceSection) {
  const base = `/episodes/${encodeURIComponent(episodeId)}`;
  if (section === "idea") return `${base}/brief`;
  if (section === "script") return `${base}/script`;
  return `${base}/studio?section=${section}`;
}

type StageState = {
  label: string;
  tone: "empty" | "ready" | "working" | "attention";
};

export type EpisodeWorkspaceState = {
  episode: { id: string; title: string; updatedAt: string };
  stages: Record<WorkspaceSection, StageState>;
  defaultSection: WorkspaceSection;
  hasActiveJobs: boolean;
  exportCount: number;
};

/** A minimal read model; no provider payloads, source text, or asset paths. */
export type WorkspaceInput = {
  episode: { id: string; title: string; updatedAt: string; revision: number };
  selectedScriptId?: string | null;
  scripts: readonly { id: string; episodeRevision: number }[];
  takes: readonly { id: string; scriptId: string; stale: boolean }[];
  tracks: readonly { id: string; voiceTakeId: string }[];
  compositions: readonly {
    id: string;
    stale: boolean;
    data: {
      mode?: "narrated" | "text";
      image?: { id: string } | null;
      music?: { id: string } | null;
      ambience: "none" | "soft-noise";
    };
  }[];
  exports: readonly { compositionId: string }[];
  jobs: readonly { kind: string; status: string }[];
};

/** Collections are newest first, matching the existing media state query. */
export function summarizeWorkspace(
  input: WorkspaceInput,
): EpisodeWorkspaceState {
  const script =
    input.scripts.find((item) => item.id === input.selectedScriptId) ||
    input.scripts[0];
  const composition = input.compositions[0];
  const take = input.takes.find((item) => item.scriptId === script?.id);
  const track = input.tracks.find((item) => item.voiceTakeId === take?.id);
  const textOnly = composition?.data.mode === "text";
  const scriptStale =
    !!script && script.episodeRevision !== input.episode.revision;
  const currentExport =
    composition &&
    !composition.stale &&
    input.exports.some((item) => item.compositionId === composition.id);
  const stages: EpisodeWorkspaceState["stages"] = {
    idea: { label: "Saved", tone: "ready" },
    script: !script
      ? { label: "Start writing", tone: "empty" }
      : scriptStale
        ? { label: "Idea changed", tone: "attention" }
        : { label: "Draft saved", tone: "ready" },
    voice: textOnly
      ? {
          label: composition.stale ? "Update reading cards" : "Reading cards",
          tone: composition.stale ? "attention" : "ready",
        }
      : !take
        ? input.takes.length
          ? { label: "Update narration", tone: "attention" }
          : { label: "Choose voice or text", tone: "empty" }
        : take.stale
          ? { label: "Update narration", tone: "attention" }
          : !track
            ? { label: "Timing needed", tone: "attention" }
            : { label: "Take saved", tone: "ready" },
    music: !composition
      ? { label: "Optional", tone: "empty" }
      : {
          label: composition.data.music
            ? "Music selected"
            : composition.data.ambience === "soft-noise"
              ? "Ambience selected"
              : "No music",
          tone: "ready",
        },
    background: !composition
      ? { label: "Choose a background", tone: "empty" }
      : {
          label: composition.data.image
            ? "Image selected"
            : "Built-in background",
          tone: "ready",
        },
    video: !composition
      ? { label: "Preview not saved", tone: "empty" }
      : composition.stale
        ? { label: "Update preview", tone: "attention" }
        : { label: "Preview saved", tone: "ready" },
    exports: currentExport
      ? { label: "Current preview exported", tone: "ready" }
      : input.exports.length
        ? { label: "Earlier exports", tone: "attention" }
        : { label: "No exports yet", tone: "empty" },
  };
  const activeJobs = input.jobs.filter(
    (job) => job.status === "queued" || job.status === "running",
  );
  const sectionForJob = (kind: string): WorkspaceSection | undefined =>
    kind === "draft"
      ? "script"
      : kind === "narration"
        ? "voice"
        : kind === "render"
          ? "exports"
          : undefined;
  for (const job of input.jobs) {
    if (job.status !== "failed" && job.status !== "needs_attention") continue;
    const section = sectionForJob(job.kind);
    // A usable saved artifact is more helpful than an older failed attempt.
    if (!section || stages[section].tone === "ready") continue;
    stages[section] = {
      label:
        job.status === "needs_attention"
          ? "Check provider result"
          : "Last attempt failed",
      tone: "attention",
    };
  }
  for (const job of activeJobs) {
    const section = sectionForJob(job.kind);
    if (section) {
      // Several alternatives may be queued; do not hide an active generation.
      if (stages[section].tone === "working" && job.status === "queued") continue;
      stages[section] = {
        label: job.status === "queued" ? "Queued" : "Generating",
        tone: "working",
      };
    }
  }
  return {
    episode: {
      id: input.episode.id,
      title: input.episode.title,
      updatedAt: input.episode.updatedAt,
    },
    stages,
    defaultSection: composition ? "video" : script ? "script" : "idea",
    hasActiveJobs: activeJobs.length > 0,
    exportCount: input.exports.length,
  };
}
