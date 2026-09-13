import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, getPool } from "../db/client";
import { jobs } from "../db/schema";
import { digest } from "../hash";
export type Job = typeof jobs.$inferSelect;
export async function enqueueJob(
  kind: string,
  input: Record<string, unknown>,
  episodeId?: string,
) {
  const key = digest({ kind, input });
  const db = getDb();
  await db
    .insert(jobs)
    .values({ kind, input, key, episodeId })
    .onConflictDoNothing();
  return (await db.select().from(jobs).where(eq(jobs.key, key)))[0];
}
export async function findJob(id: string) {
  return (await getDb().select().from(jobs).where(eq(jobs.id, id)))[0] || null;
}
export async function listJobs(episodeId?: string) {
  return getDb()
    .select()
    .from(jobs)
    .where(episodeId ? eq(jobs.episodeId, episodeId) : undefined)
    .orderBy(desc(jobs.createdAt))
    .limit(20);
}
export async function claimJob(id?: string) {
  const pool = getPool();
  await pool.query(
    "UPDATE jobs SET status=CASE WHEN dispatched_at IS NOT NULL THEN 'needs_attention' WHEN attempts>=3 THEN 'failed' ELSE 'queued' END, error=CASE WHEN dispatched_at IS NOT NULL THEN 'PROVIDER_RESULT_UNCERTAIN' ELSE 'WORKER_LEASE_EXPIRED' END,owner=NULL WHERE status='running' AND lease_until<now()",
  );
  const owner = randomUUID();
  const result = await pool.query(
    `UPDATE jobs SET status='running',owner=$1,attempts=attempts+1,lease_until=now()+interval '90 seconds',updated_at=now(),error=NULL WHERE id=(SELECT id FROM jobs WHERE status='queued' AND available_at<=now() AND ($2::uuid IS NULL OR id=$2) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id`,
    [owner, id || null],
  );
  return result.rows[0] ? findJob(result.rows[0].id) : null;
}
export async function heartbeat(job: Job) {
  const result = await getDb()
    .update(jobs)
    .set({
      leaseUntil: sql`now()+interval '90 seconds'`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(jobs.id, job.id),
        eq(jobs.owner, job.owner!),
        eq(jobs.status, "running"),
      ),
    )
    .returning({ id: jobs.id });
  if (!result.length) throw new Error("JOB_LEASE_LOST");
}
export async function progress(job: Job, message: string) {
  await getDb()
    .update(jobs)
    .set({ progress: message, updatedAt: new Date() })
    .where(and(eq(jobs.id, job.id), eq(jobs.owner, job.owner!)));
}
export async function retryJob(id: string) {
  return (
    await getDb()
      .update(jobs)
      .set({
        status: "queued",
        attempts: 0,
        error: null,
        availableAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(jobs.id, id), eq(jobs.status, "failed")))
      .returning()
  )[0];
}
