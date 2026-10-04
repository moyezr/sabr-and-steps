import "server-only";
import { z } from "zod";
import { findEpisode } from "../db/episodes";
import { listSourceImports } from "../db/sources";
import { listDrafts } from "./drafts";
import { listJobs } from "../jobs/store";
import { scriptBlockSchema } from "../../domain/script";
import { scriptVersionState } from "./versions";
import { getDb } from "../db/client";
import { scriptSourceContext } from "./source-context";
export async function writingState(episodeId: string) {
  const [episode, editions, scripts, jobs, versions] = await Promise.all([
    findEpisode(episodeId),
    listSourceImports(),
    listDrafts(episodeId),
    listJobs(episodeId),
    scriptVersionState(episodeId),
  ]);
  if (!episode) throw new Error("EPISODE_NOT_FOUND");
  const db = getDb();
  const workingBase = versions.workingDraft
    ? scripts.find(
        (script) => script.id === versions.workingDraft!.baseScriptId,
      )
    : undefined;
  if (versions.workingDraft && !workingBase)
    throw new Error("SCRIPT_NOT_FOUND");
  const [scriptSources, workingSources] = await Promise.all([
    Promise.all(
      scripts.map((script) =>
        scriptSourceContext(db, script.importId, script.blocks),
      ),
    ),
    workingBase && versions.workingDraft
      ? scriptSourceContext(
          db,
          workingBase.importId,
          versions.workingDraft.blocks,
        )
      : Promise.resolve([]),
  ]);
  return {
    episode,
    ...versions,
    workingSources,
    editions: editions
      .filter((e) => e.status === "completed")
      .map((e) => ({
        id: e.id,
        name: e.name,
        environment: e.environment,
        rightsStatus: e.rightsStatus,
        coverage: e.expectedChapters,
      })),
    scripts: scripts.map((s, index) => ({
      id: s.id,
      title: s.title,
      blocks: z.array(scriptBlockSchema).parse(s.blocks),
      checksum: s.checksum,
      reviewState: s.reviewState,
      episodeRevision: s.episodeRevision,
      importId: s.importId,
      parentId: s.parentId,
      label: s.label,
      changeKind: s.changeKind,
      generationInstructions: s.generationInstructions,
      model: s.model,
      createdAt: s.createdAt.toISOString(),
      sources: scriptSources[index],
    })),
    jobs: jobs.map((j) => ({
      id: j.id,
      kind: j.kind,
      status: j.status,
      progress: j.progress,
      error: j.error,
      updatedAt: j.updatedAt.toISOString(),
    })),
  };
}
export type WritingState = Awaited<ReturnType<typeof writingState>>;
