import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { scriptBlockSchema, validateScriptQuotes } from "../../domain/script";
import { getDb } from "../db/client";
import {
  episodeScriptDrafts,
  episodes,
  episodeWorkspaceStates,
  scriptRevisions,
  sourceImports,
  sourcePassages,
} from "../db/schema";
import { digest } from "../hash";

const titleSchema = z.string().trim().min(1).max(140);
const labelSchema = z.string().trim().min(1).max(140);

export const workingDraftInputSchema = z.object({
  baseScriptId: z.string().uuid(),
  revision: z.number().int().nonnegative(),
  title: titleSchema,
  blocks: z.array(scriptBlockSchema).min(1).max(30),
});

export const selectScriptInputSchema = z.object({
  scriptId: z.string().uuid(),
  selectionRevision: z.number().int().nonnegative(),
});

export const checkpointInputSchema = z.object({
  revision: z.number().int().positive(),
  selectionRevision: z.number().int().nonnegative(),
  label: labelSchema,
});

export const restoreScriptInputSchema = z.object({
  scriptId: z.string().uuid(),
  selectionRevision: z.number().int().nonnegative(),
  label: labelSchema.optional(),
});

export const discardDraftInputSchema = z.object({
  revision: z.number().int().positive(),
});

export type WorkingDraft = {
  baseScriptId: string | null;
  revision: number;
  title: string;
  blocks: z.infer<typeof scriptBlockSchema>[];
  updatedAt: string;
};

export async function scriptVersionState(episodeId: string) {
  const db = getDb();
  const [workspace, draft, latest] = await Promise.all([
    db
      .select()
      .from(episodeWorkspaceStates)
      .where(eq(episodeWorkspaceStates.episodeId, episodeId))
      .then((rows) => rows[0]),
    db
      .select()
      .from(episodeScriptDrafts)
      .where(eq(episodeScriptDrafts.episodeId, episodeId))
      .then((rows) => rows[0]),
    db
      .select({ id: scriptRevisions.id })
      .from(scriptRevisions)
      .where(eq(scriptRevisions.episodeId, episodeId))
      .orderBy(desc(scriptRevisions.createdAt), desc(scriptRevisions.id))
      .limit(1)
      .then((rows) => rows[0]),
  ]);
  return {
    selectedScriptId: workspace?.selectedScriptId || latest?.id || null,
    selectionRevision: workspace?.revision || 0,
    workingDraft: draft
      ? {
          baseScriptId: draft.baseScriptId,
          revision: draft.revision,
          title: draft.title,
          blocks: z.array(scriptBlockSchema).parse(draft.blocks),
          updatedAt: draft.updatedAt.toISOString(),
        }
      : null,
  };
}

/** Selects only the first generated script. Later generations remain alternatives. */
export async function selectFirstScript(episodeId: string, scriptId: string) {
  const db = getDb();
  await db.transaction(async (tx) => {
    const current = (
      await tx
        .select()
        .from(episodeWorkspaceStates)
        .where(eq(episodeWorkspaceStates.episodeId, episodeId))
        .for("update")
    )[0];
    if (!current) {
      await tx
        .insert(episodeWorkspaceStates)
        .values({ episodeId, selectedScriptId: scriptId })
        .onConflictDoNothing();
      return;
    }
    if (current.selectedScriptId) return;
    await tx
      .update(episodeWorkspaceStates)
      .set({
        selectedScriptId: scriptId,
        revision: sql`${episodeWorkspaceStates.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(episodeWorkspaceStates.episodeId, episodeId),
          eq(episodeWorkspaceStates.revision, current.revision),
        ),
      );
  });
}

export async function autosaveWorkingDraft(episodeId: string, raw: unknown) {
  const input = workingDraftInputSchema.parse(raw);
  const db = getDb();
  return db.transaction(async (tx) => {
    const episode = (
      await tx.select().from(episodes).where(eq(episodes.id, episodeId))
    )[0];
    const base = (
      await tx
        .select()
        .from(scriptRevisions)
        .where(
          and(
            eq(scriptRevisions.id, input.baseScriptId),
            eq(scriptRevisions.episodeId, episodeId),
          ),
        )
    )[0];
    const workspace = (
      await tx
        .select()
        .from(episodeWorkspaceStates)
        .where(eq(episodeWorkspaceStates.episodeId, episodeId))
        .for("update")
    )[0];
    const existing = (
      await tx
        .select()
        .from(episodeScriptDrafts)
        .where(eq(episodeScriptDrafts.episodeId, episodeId))
        .for("update")
    )[0];
    if (!episode) throw new Error("EPISODE_NOT_FOUND");
    if (!base) throw new Error("SCRIPT_NOT_FOUND");
    const fallback = workspace?.selectedScriptId
      ? undefined
      : (
          await tx
            .select({ id: scriptRevisions.id })
            .from(scriptRevisions)
            .where(eq(scriptRevisions.episodeId, episodeId))
            .orderBy(desc(scriptRevisions.createdAt), desc(scriptRevisions.id))
            .limit(1)
        )[0];
    if ((workspace?.selectedScriptId || fallback?.id) !== base.id)
      throw new Error("SCRIPT_SELECTION_CHANGED");
    if (
      (existing &&
        (existing.revision !== input.revision ||
          existing.baseScriptId !== input.baseScriptId)) ||
      (!existing && input.revision !== 0)
    )
      throw new Error("SCRIPT_DRAFT_CONFLICT");

    const edition = (
      await tx
        .select()
        .from(sourceImports)
        .where(eq(sourceImports.id, base.importId))
    )[0];
    const sources = (
      await tx
        .select()
        .from(sourcePassages)
        .where(eq(sourcePassages.importId, base.importId))
    ).map((passage) => ({ ...passage, edition: edition.name }));
    validateScriptQuotes(input.blocks, sources);

    if (!existing) {
      const inserted = await tx
        .insert(episodeScriptDrafts)
        .values({
          episodeId,
          baseScriptId: input.baseScriptId,
          revision: 1,
          title: input.title,
          blocks: input.blocks,
        })
        .onConflictDoNothing()
        .returning();
      if (!inserted[0]) throw new Error("SCRIPT_DRAFT_CONFLICT");
      return inserted[0];
    }
    const updated = await tx
      .update(episodeScriptDrafts)
      .set({
        title: input.title,
        blocks: input.blocks,
        revision: sql`${episodeScriptDrafts.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(episodeScriptDrafts.episodeId, episodeId),
          eq(episodeScriptDrafts.revision, input.revision),
        ),
      )
      .returning();
    if (!updated[0]) throw new Error("SCRIPT_DRAFT_CONFLICT");
    return updated[0];
  });
}

export async function selectScriptVersion(episodeId: string, raw: unknown) {
  const input = selectScriptInputSchema.parse(raw);
  const db = getDb();
  return db.transaction(async (tx) => {
    const script = (
      await tx
        .select({ id: scriptRevisions.id })
        .from(scriptRevisions)
        .where(
          and(
            eq(scriptRevisions.id, input.scriptId),
            eq(scriptRevisions.episodeId, episodeId),
          ),
        )
    )[0];
    if (!script) throw new Error("SCRIPT_NOT_FOUND");
    const workspace = (
      await tx
        .select()
        .from(episodeWorkspaceStates)
        .where(eq(episodeWorkspaceStates.episodeId, episodeId))
        .for("update")
    )[0];
    if ((workspace?.revision || 0) !== input.selectionRevision)
      throw new Error("SCRIPT_SELECTION_CONFLICT");
    const draft = (
      await tx
        .select({ revision: episodeScriptDrafts.revision })
        .from(episodeScriptDrafts)
        .where(eq(episodeScriptDrafts.episodeId, episodeId))
        .for("update")
    )[0];
    let next;
    if (!workspace) {
      next = (
        await tx
          .insert(episodeWorkspaceStates)
          .values({ episodeId, selectedScriptId: script.id })
          .returning()
      )[0];
    } else if (workspace.selectedScriptId === script.id) {
      next = workspace;
    } else {
      if (draft) throw new Error("SCRIPT_DRAFT_EXISTS");
      next = (
        await tx
          .update(episodeWorkspaceStates)
          .set({
            selectedScriptId: script.id,
            revision: sql`${episodeWorkspaceStates.revision} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(episodeWorkspaceStates.episodeId, episodeId),
              eq(episodeWorkspaceStates.revision, input.selectionRevision),
            ),
          )
          .returning()
      )[0];
      if (!next) throw new Error("SCRIPT_SELECTION_CONFLICT");
    }
    return next;
  });
}

export async function discardWorkingDraft(episodeId: string, raw: unknown) {
  const input = discardDraftInputSchema.parse(raw);
  const db = getDb();
  return db.transaction(async (tx) => {
    const draft = (
      await tx
        .select()
        .from(episodeScriptDrafts)
        .where(eq(episodeScriptDrafts.episodeId, episodeId))
        .for("update")
    )[0];
    if (!draft) return null;
    if (draft.revision !== input.revision)
      throw new Error("SCRIPT_DRAFT_CONFLICT");
    const deleted = await tx
      .delete(episodeScriptDrafts)
      .where(
        and(
          eq(episodeScriptDrafts.episodeId, episodeId),
          eq(episodeScriptDrafts.revision, input.revision),
        ),
      )
      .returning({ episodeId: episodeScriptDrafts.episodeId });
    if (!deleted[0]) throw new Error("SCRIPT_DRAFT_CONFLICT");
    return deleted[0];
  });
}

export async function checkpointWorkingDraft(episodeId: string, raw: unknown) {
  const input = checkpointInputSchema.parse(raw);
  const db = getDb();
  return db.transaction(async (tx) => {
    const episode = (
      await tx.select().from(episodes).where(eq(episodes.id, episodeId))
    )[0];
    const workspace = (
      await tx
        .select()
        .from(episodeWorkspaceStates)
        .where(eq(episodeWorkspaceStates.episodeId, episodeId))
        .for("update")
    )[0];
    const draft = (
      await tx
        .select()
        .from(episodeScriptDrafts)
        .where(eq(episodeScriptDrafts.episodeId, episodeId))
        .for("update")
    )[0];
    if (!episode) throw new Error("EPISODE_NOT_FOUND");
    if (!draft) throw new Error("SCRIPT_DRAFT_NOT_FOUND");
    if (draft.revision !== input.revision)
      throw new Error("SCRIPT_DRAFT_CONFLICT");
    if ((workspace?.revision || 0) !== input.selectionRevision)
      throw new Error("SCRIPT_SELECTION_CONFLICT");
    const base = (
      await tx
        .select()
        .from(scriptRevisions)
        .where(
          and(
            eq(scriptRevisions.id, draft.baseScriptId!),
            eq(scriptRevisions.episodeId, episodeId),
          ),
        )
    )[0];
    if (!base) throw new Error("SCRIPT_NOT_FOUND");
    const selectedId = workspace?.selectedScriptId || base.id;
    if (selectedId !== base.id) throw new Error("SCRIPT_SELECTION_CHANGED");
    const created = (
      await tx
        .insert(scriptRevisions)
        .values({
          episodeId,
          episodeRevision: episode.revision,
          parentId: base.id,
          importId: base.importId,
          indexId: base.indexId,
          model: base.model,
          title: draft.title,
          blocks: draft.blocks,
          retrieval: base.retrieval,
          checksum: digest({ title: draft.title, blocks: draft.blocks }),
          label: input.label,
          changeKind: "checkpoint",
          generationInstructions: "",
        })
        .returning()
    )[0];
    if (!workspace) {
      await tx
        .insert(episodeWorkspaceStates)
        .values({ episodeId, selectedScriptId: created.id });
    } else {
      const updated = await tx
        .update(episodeWorkspaceStates)
        .set({
          selectedScriptId: created.id,
          revision: sql`${episodeWorkspaceStates.revision} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(episodeWorkspaceStates.episodeId, episodeId),
            eq(episodeWorkspaceStates.revision, input.selectionRevision),
          ),
        )
        .returning({ id: episodeWorkspaceStates.episodeId });
      if (!updated[0]) throw new Error("SCRIPT_SELECTION_CONFLICT");
    }
    await tx
      .delete(episodeScriptDrafts)
      .where(eq(episodeScriptDrafts.episodeId, episodeId));
    return created;
  });
}

export async function restoreScriptVersion(episodeId: string, raw: unknown) {
  const input = restoreScriptInputSchema.parse(raw);
  const db = getDb();
  return db.transaction(async (tx) => {
    const episode = (
      await tx.select().from(episodes).where(eq(episodes.id, episodeId))
    )[0];
    const workspace = (
      await tx
        .select()
        .from(episodeWorkspaceStates)
        .where(eq(episodeWorkspaceStates.episodeId, episodeId))
        .for("update")
    )[0];
    const target = (
      await tx
        .select()
        .from(scriptRevisions)
        .where(
          and(
            eq(scriptRevisions.id, input.scriptId),
            eq(scriptRevisions.episodeId, episodeId),
          ),
        )
    )[0];
    const latest = (
      await tx
        .select({ id: scriptRevisions.id })
        .from(scriptRevisions)
        .where(eq(scriptRevisions.episodeId, episodeId))
        .orderBy(desc(scriptRevisions.createdAt), desc(scriptRevisions.id))
        .limit(1)
    )[0];
    const draft = (
      await tx
        .select({ revision: episodeScriptDrafts.revision })
        .from(episodeScriptDrafts)
        .where(eq(episodeScriptDrafts.episodeId, episodeId))
        .for("update")
    )[0];
    if (!episode) throw new Error("EPISODE_NOT_FOUND");
    if (!target) throw new Error("SCRIPT_NOT_FOUND");
    if ((workspace?.revision || 0) !== input.selectionRevision)
      throw new Error("SCRIPT_SELECTION_CONFLICT");
    if (draft) throw new Error("SCRIPT_DRAFT_EXISTS");
    const selectedId = workspace?.selectedScriptId || latest?.id;
    if (!selectedId) throw new Error("SCRIPT_NOT_FOUND");
    const created = (
      await tx
        .insert(scriptRevisions)
        .values({
          episodeId,
          episodeRevision: episode.revision,
          parentId: target.id,
          importId: target.importId,
          indexId: target.indexId,
          model: target.model,
          title: target.title,
          blocks: target.blocks,
          retrieval: target.retrieval,
          checksum: target.checksum,
          label: input.label || `Restored ${target.label}`,
          changeKind: "restored",
          generationInstructions: target.generationInstructions,
        })
        .returning()
    )[0];
    if (!workspace) {
      await tx
        .insert(episodeWorkspaceStates)
        .values({ episodeId, selectedScriptId: created.id });
    } else {
      const updated = await tx
        .update(episodeWorkspaceStates)
        .set({
          selectedScriptId: created.id,
          revision: sql`${episodeWorkspaceStates.revision} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(episodeWorkspaceStates.episodeId, episodeId),
            eq(episodeWorkspaceStates.revision, input.selectionRevision),
          ),
        )
        .returning({ id: episodeWorkspaceStates.episodeId });
      if (!updated[0]) throw new Error("SCRIPT_SELECTION_CONFLICT");
    }
    return created;
  });
}
