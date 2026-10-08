import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "./client";
import { episodes } from "./schema";
import type { Episode, EpisodeInput } from "../../domain/episode";

function serialize(row: typeof episodes.$inferSelect): Episode {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listEpisodes() {
  return (
    await getDb().select().from(episodes).orderBy(desc(episodes.updatedAt))
  ).map(serialize);
}

export async function findEpisode(id: string) {
  const [row] = await getDb()
    .select()
    .from(episodes)
    .where(eq(episodes.id, id));
  return row ? serialize(row) : null;
}

export async function createEpisode(input: EpisodeInput) {
  const [row] = await getDb().insert(episodes).values(input).returning();
  return serialize(row);
}

export async function updateEpisode(
  id: string,
  input: EpisodeInput,
  revision: number,
) {
  const [row] = await getDb()
    .update(episodes)
    .set({
      ...input,
      revision: sql`${episodes.revision} + 1`,
      contentRevision: sql`CASE WHEN ${episodes.title} IS DISTINCT FROM ${input.title} OR ${episodes.brief} IS DISTINCT FROM ${input.brief} OR ${episodes.theme} IS DISTINCT FROM ${input.theme} OR ${episodes.targetSeconds} IS DISTINCT FROM ${input.targetSeconds} THEN ${episodes.revision} + 1 ELSE ${episodes.contentRevision} END`,
      updatedAt: new Date(),
    })
    .where(and(eq(episodes.id, id), eq(episodes.revision, revision)))
    .returning();
  return row ? serialize(row) : null;
}
