import "server-only";
import { setTimeout as delay } from "node:timers/promises";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client";
import { jobs } from "../db/schema";
import { claimJob, heartbeat, findJob, type Job } from "./store";
import { createDraft } from "../writing/drafts";
import { buildIndex, retrieve } from "../writing/retrieval";
import { ProviderError } from "../providers/openrouter";
import { writeArtifact } from "./files";
export async function handleJob(job: Job): Promise<Record<string, unknown>> {
  if (job.kind === "draft") return createDraft(job);
  if (job.kind === "narration") {
    const { createNarration } = await import("../media/narration");
    return createNarration(job);
  }
  if (job.kind === "render") {
    const { renderVideo } = await import("../media/render");
    return renderVideo(job);
  }
  if (job.kind === "index") {
    const input = z.object({ importId: z.string().uuid() }).parse(job.input);
    return { indexId: await buildIndex(job, input.importId) };
  }
  if (job.kind === "retrieval_eval") {
    const input = z.object({ importId: z.string().uuid() }).parse(job.input);
    const indexId = await buildIndex(job, input.importId);
    const cases = [
      {
        query: "seek help through steadfastness and prayer",
        expected: "2:153",
      },
      { query: "remember God and be thankful", expected: "2:152" },
      { query: "fear hunger loss and steadfastness", expected: "2:155" },
      { query: "fasting is prescribed for believers", expected: "2:183" },
      {
        query:
          "JavaScript compiler optimization using WebAssembly SIMD instructions",
        expected: null,
      },
    ];
    const results = [];
    for (const c of cases) {
      const found = await retrieve(job, indexId, c.query);
      results.push({
        ...c,
        passed: c.expected
          ? found.slice(0, 5).some((s) => s.reference === c.expected)
          : found.length === 0,
        results: found.map((s) => ({
          reference: s.reference,
          similarity: s.similarity,
          keywordRank: s.keywordRank,
        })),
      });
    }
    await writeArtifact(`jobs/${job.id}/retrieval-evaluation.json`, {
      indexId,
      results,
    });
    if (results.some((r) => !r.passed))
      throw new Error("RETRIEVAL_EVALUATION_FAILED");
    return { indexId, results };
  }
  throw new Error("JOB_KIND_NOT_SUPPORTED");
}
export async function runOne(id?: string, handler = handleJob) {
  const job = await claimJob(id);
  if (!job) return null;
  const abort = new AbortController();
  let heartbeatError: unknown;
  const keepAlive = (async () => {
    while (!abort.signal.aborted) {
      await delay(20000, undefined, { signal: abort.signal }).catch(
        () => undefined,
      );
      if (!abort.signal.aborted) {
        try {
          await heartbeat(job);
        } catch (e) {
          heartbeatError = e;
          break;
        }
      }
    }
  })();
  try {
    const result = await handler(job);
    if (heartbeatError) throw heartbeatError;
    await getDb()
      .update(jobs)
      .set({
        status: "succeeded",
        result,
        progress: "Completed",
        leaseUntil: null,
        owner: null,
        dispatchedAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(jobs.id, job.id), eq(jobs.owner, job.owner!)));
  } catch (error) {
    const current = await findJob(job.id);
    const uncertain =
      Boolean(current?.dispatchedAt) ||
      (error instanceof ProviderError && error.uncertain);
    const retry =
      error instanceof ProviderError &&
      error.retryable &&
      job.attempts < 3 &&
      !uncertain;
    const code =
      error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message)
        ? error.message
        : "JOB_FAILED";
    await getDb()
      .update(jobs)
      .set({
        status: uncertain ? "needs_attention" : retry ? "queued" : "failed",
        error: code,
        progress: uncertain
          ? "Provider response uncertain; reconcile before retry"
          : retry
            ? "Rate limited; bounded retry scheduled"
            : "Stopped; see error",
        availableAt: new Date(Date.now() + 5000 * 2 ** job.attempts),
        leaseUntil: null,
        owner: null,
        updatedAt: new Date(),
      })
      .where(and(eq(jobs.id, job.id), eq(jobs.owner, job.owner!)));
  } finally {
    abort.abort();
    await keepAlive;
  }
  return findJob(job.id);
}
