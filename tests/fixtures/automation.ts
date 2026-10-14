import { eq } from "drizzle-orm";
import { getDb } from "../../lib/server/db/client";
import {
  embeddingIndexes,
  passageEmbeddings,
  queryEmbeddings,
  sourceImports,
  sourcePassages,
  episodes,
} from "../../lib/server/db/schema";
import { EMBEDDING_CONFIG } from "../../lib/domain/script";
import { configHash } from "../../lib/server/writing/retrieval";
import { digest } from "../../lib/server/hash";
import { saveAutomationProfile } from "../../lib/server/automation/store";

export async function seedAutomationFixture() {
  const db = getDb();
  const source = (
    await db
      .insert(sourceImports)
      .values({
        environment: "prelive",
        resourceId: 85,
        name: "Synthetic automation source — not scripture",
        author: "Fixture",
        status: "completed",
        expectedChapters: 1,
        expectedVerses: 1,
        completedChapters: [1],
        metadata: { synthetic: true },
        rightsNotes:
          "Synthetic fixture, no real reuse permission or religious evidence.",
      })
      .returning()
  )[0];
  const passage = (
    await db
      .insert(sourcePassages)
      .values({
        importId: source.id,
        chapter: 1,
        verse: 1,
        reference: "1:1",
        chapterName: "Synthetic",
        text: "Synthetic source text for automated checks. This is not scripture.",
        arabic: "اختبار",
        raw: {},
        checksum: "synthetic-automation",
      })
      .returning()
  )[0];
  const index = (
    await db
      .insert(embeddingIndexes)
      .values({
        importId: source.id,
        configHash,
        ...EMBEDDING_CONFIG,
        state: "ready",
      })
      .returning()
  )[0];
  const vector = Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0));
  await db.insert(passageEmbeddings).values({
    indexId: index.id,
    passageId: passage.id,
    checksum: passage.checksum,
    embedding: vector,
  });
  const profile = await saveAutomationProfile({
    name: "Synthetic quiet drafts",
    importId: source.id,
    model: "openai/gpt-5.6-luna",
    theme: "hope",
    targetSeconds: 60,
    readingWpm: 180,
  });
  async function prepareQuery(episodeId: string) {
    const episode = (
      await db.select().from(episodes).where(eq(episodes.id, episodeId))
    )[0];
    const query = `${episode.title}. ${episode.brief} Theme: ${episode.theme}`;
    await db
      .insert(queryEmbeddings)
      .values({
        key: digest({ query, configHash }),
        configHash,
        embedding: vector,
      })
      .onConflictDoNothing();
  }
  const generator = async () => ({
    title: "Synthetic quiet reminder",
    supported: true,
    reason: "",
    blocks: [
      {
        kind: "reflection" as const,
        text: "Synthetic original encouragement.",
        sourceId: "",
      },
      { kind: "quote" as const, text: "", sourceId: passage.id },
    ],
  });
  return { source, passage, profile, prepareQuery, generator };
}
