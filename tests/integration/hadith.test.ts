import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import nextEnv from "@next/env";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { ScriptBlock } from "../../lib/domain/script";
import { EMPTY_EPISODE } from "../../lib/domain/episode";
nextEnv.loadEnvConfig(process.cwd());

test("hadith imports deduplicate immutable records and preserve canonical reviewed citations in scripts", async () => {
  assert(process.env.DATABASE_URL);
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const name = `sabr_hadith_test_${randomUUID().replaceAll("-", "")}`;
  let pool: Pool | undefined;
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    const { getDb, getPool } = await import("../../lib/server/db/client");
    pool = getPool();
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
    const {
      importHadithDataset,
      browseHadith,
      resolveHadithQuotes,
      reviewHadith,
    } = await import("../../lib/server/sources/hadith");
    const record = {
      collectionCode: "fixture",
      collectionName: "Synthetic hadith fixture (not scripture)",
      bookNumber: "1",
      bookName: "Fixture book",
      chapterId: "1.1",
      chapterTitle: "Fixture chapter",
      hadithNumber: "12a",
      numberingScheme: "Fixture collection numbering",
      otherReferences: [
        { scheme: "Fixture alternate numbering", value: "Book 1, report 2" },
      ],
      narrator: null,
      text: "Complete synthetic report. This is not religious source material.",
      context: [
        {
          reference: "Fixture chapter introduction",
          text: "Full synthetic source context. Not scripture.",
        },
      ],
      grades: [],
      sourceUrl: "https://example.com/synthetic/12a",
    };
    const dataset = {
      edition: "Synthetic test hadith edition",
      translator: null,
      provenance: "Synthetic source fixture for deterministic acceptance only.",
      coverageNotes: "One synthetic report. No real hadith coverage.",
      rightsStatus: "not_cleared",
      rightsNotes: "No publication permission claimed.",
      reviewedBy: "Synthetic fixture reviewer",
      reviewedAt: "2026-10-08T00:00:00Z",
      records: [record],
    };
    const outcomes = await Promise.all([
      importHadithDataset(dataset),
      importHadithDataset(dataset),
    ]);
    assert.equal(outcomes[0].id, outcomes[1].id);
    assert.equal(outcomes.filter((result) => result.cached).length, 1);
    let browser = await browseHadith({ importId: outcomes[0].id, page: 1 });
    assert.equal(browser.total, 1);
    assert.equal(browser.rows[0].reviewState, "reviewed");
    assert.equal(browser.rows[0].narrator, null);
    assert.deepEqual(browser.rows[0].grades, []);
    assert.equal(browser.selected?.translator, null);
    assert.equal(browser.selected?.rightsStatus, "not_cleared");
    const source = browser.rows[0];
    const block: ScriptBlock = {
      kind: "quote",
      sourceKind: "hadith",
      sourceId: source.id,
      importId: source.importId,
      edition: dataset.edition,
      reference: source.reference,
      text: source.text,
    };
    const resolved = await resolveHadithQuotes(getDb(), [block]);
    assert.equal(resolved[0].sourceKind, "hadith");
    assert.deepEqual(resolved[0].context, [
      { reference: source.reference, text: source.text },
      ...record.context,
    ]);
    assert.equal(resolved[0].numberingScheme, record.numberingScheme);
    assert.deepEqual(resolved[0].otherReferences, record.otherReferences);
    for (const changes of [
      { text: "Changed wording" },
      { reference: "Wrong number" },
      { edition: "Wrong edition" },
      { importId: randomUUID() },
      { sourceId: randomUUID() },
    ]) {
      await assert.rejects(
        resolveHadithQuotes(getDb(), [{ ...block, ...changes }]),
        /CANONICAL_QUOTATION_CHANGED/,
      );
    }
    assert.equal(
      (await browseHadith({ importId: source.importId, q: "%", page: 1 }))
        .total,
      0,
    );
    const revised = await importHadithDataset({
      ...dataset,
      records: [
        { ...record, text: "Revised synthetic report. Not scripture." },
      ],
    });
    assert.notEqual(revised.id, source.importId);
    assert.equal(
      (await browseHadith({ importId: source.importId, page: 1 })).rows[0].text,
      record.text,
    );
    const provider = await importHadithDataset(dataset, {
      provider: "sunnah",
      reviewed: false,
      rawRecords: [{ privatePayload: "fixture" }],
    });
    const repeatedProvider = await importHadithDataset(
      { ...dataset, reviewedAt: "2026-10-08T01:00:00Z" },
      { provider: "sunnah", reviewed: false },
    );
    assert.equal(provider.id, repeatedProvider.id);
    browser = await browseHadith({ importId: provider.id, page: 1 });
    const pendingBlock: ScriptBlock = {
      ...block,
      sourceId: browser.rows[0].id,
      importId: provider.id,
    };
    await assert.rejects(
      resolveHadithQuotes(getDb(), [pendingBlock]),
      /HADITH_REVIEW_REQUIRED/,
    );
    await reviewHadith({
      sourceId: browser.rows[0].id,
      importId: provider.id,
      reviewedBy: "Fixture reviewer",
      notes: "Reviewed complete synthetic report context.",
    });
    assert.equal(
      (await resolveHadithQuotes(getDb(), [pendingBlock]))[0].text,
      record.text,
    );
    const { GET, POST } = await import("../../app/api/hadith/route");
    const headers = {
      "Content-Type": "application/json",
      Origin: "http://localhost",
      Host: "localhost",
    };
    for (const invalidBody of ["{", "x".repeat(4000001)]) {
      const rejected = await POST(
        new Request("http://localhost/api/hadith", {
          method: "POST",
          headers,
          body: invalidBody,
        }),
      );
      assert.equal(rejected.status, 422);
      assert.equal(
        (await rejected.json()).error,
        "Use a valid bounded hadith import or review request.",
      );
    }
    const api = await GET(
      new Request(`http://localhost/api/hadith?importId=${provider.id}`),
    );
    assert.equal(api.status, 200);
    const body = await api.json();
    assert.equal("raw" in body.rows[0], false);
    assert.equal("checksum" in body.rows[0], false);
    assert.equal(
      (await GET(new Request("http://localhost/api/hadith?page=401"))).status,
      422,
    );
    assert.equal(
      (
        await GET(
          new Request(`http://localhost/api/hadith?importId=${randomUUID()}`),
        )
      ).status,
      404,
    );
    const { sourceImports } = await import("../../lib/server/db/schema");
    const [quranEdition] = await getDb()
      .insert(sourceImports)
      .values({
        environment: "prelive",
        resourceId: 1,
        name: "Synthetic Qur’an edition",
        author: "Fixture author",
        status: "completed",
        expectedChapters: 1,
        expectedVerses: 1,
        completedChapters: [1],
        metadata: {},
        rightsNotes: "Synthetic fixture only.",
      })
      .returning();
    const { createEpisode } = await import("../../lib/server/db/episodes");
    const { startManualDraft, autosaveWorkingDraft, checkpointWorkingDraft } =
      await import("../../lib/server/writing/versions");
    const { writingState } = await import("../../lib/server/writing/state");
    const episode = await createEpisode({
      ...EMPTY_EPISODE,
      title: "Synthetic hadith acceptance",
    });
    const initial = await startManualDraft(episode.id, {
      importId: quranEdition.id,
      episodeRevision: episode.revision,
      title: episode.title,
      text: "Original synthetic reflection.",
    });
    await autosaveWorkingDraft(episode.id, {
      baseScriptId: initial.id,
      revision: 0,
      title: episode.title,
      blocks: [
        { kind: "reflection", text: "Original synthetic reflection." },
        block,
      ],
    });
    const state = await writingState(episode.id);
    assert.equal(state.workingSources[0].sourceKind, "hadith");
    const saved = await checkpointWorkingDraft(episode.id, {
      revision: state.workingDraft!.revision,
      selectionRevision: state.selectionRevision,
      label: "Synthetic reviewed hadith",
    });
    assert.equal(saved.importId, quranEdition.id);
    assert.equal((saved.blocks as ScriptBlock[])[1].kind, "quote");
    assert.equal(
      (await writingState(episode.id)).scripts.find(
        (script) => script.id === saved.id,
      )?.sources[0].sourceKind,
      "hadith",
    );
    // The allowed 30 full-report quotes remain saveable even with JSON escaping.
    const prefix = "Synthetic long boundary fixture, not scripture: ";
    const longText = prefix + '"'.repeat(20000 - prefix.length);
    const longImport = await importHadithDataset({
      ...dataset,
      records: [{ ...record, hadithNumber: "long", text: longText }],
    });
    const longReport = (
      await browseHadith({ importId: longImport.id, page: 1 })
    ).rows[0];
    const longBlock: ScriptBlock = {
      kind: "quote",
      sourceKind: "hadith",
      sourceId: longReport.id,
      importId: longImport.id,
      edition: dataset.edition,
      reference: longReport.reference,
      text: longReport.text,
    };
    const current = await writingState(episode.id);
    const writingBody = JSON.stringify({
      action: "autosave",
      data: {
        baseScriptId: saved.id,
        revision: 0,
        title: episode.title,
        blocks: Array.from({ length: 30 }, () => longBlock),
      },
    });
    assert(writingBody.length > 512000);
    const { POST: write } = await import(
      "../../app/api/episodes/[id]/writing/route"
    );
    const writingResponse = await write(
      new Request(`http://localhost/api/episodes/${episode.id}/writing`, {
        method: "POST",
        headers,
        body: writingBody,
      }),
      { params: Promise.resolve({ id: episode.id }) },
    );
    assert.equal(writingResponse.status, 200);
    assert.equal((await writingResponse.json()).workingDraft.blocks.length, 30);
    assert.equal(current.selectedScriptId, saved.id);
  } finally {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.end();
  }
});
