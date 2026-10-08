import assert from "node:assert/strict";
import test from "node:test";
import { cartesiaStatus } from "../../lib/server/providers/cartesia-status";
import { deepgramStatus } from "../../lib/server/providers/deepgram-status";
import { readDiagnosticJson } from "../../lib/server/providers/diagnostic-http";
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
test("missing provider keys never dispatch and remain unknown", async () => {
  let calls = 0;
  const request: typeof fetch = async () => {
    calls++;
    throw new Error("unused");
  };
  for (const status of [
    await cartesiaStatus({}, request),
    await deepgramStatus({}, request),
  ]) {
    assert.equal(status.connection, "missing");
    assert.equal(status.remainingEligibleCredits, null);
    assert.equal(status.dispatchEnabled, false);
  }
  assert.equal(calls, 0);
});
test("Cartesia catalog access and admin usage never establish a spendable balance", async () => {
  const requests: string[] = [];
  const request: typeof fetch = async (url, init) => {
    requests.push(String(url));
    assert.equal(init?.redirect, "error");
    assert.equal(init?.cache, "no-store");
    return String(url).includes("voices")
      ? response({ data: [{ id: "voice" }] })
      : response({ data: [{ credits: 1200 }] });
  };
  const standard = await cartesiaStatus(
    { CARTESIA_API_KEY: "test-regular" },
    request,
  );
  assert.equal(standard.connection, "accessible");
  assert.equal(standard.creditStatus, "unknown");
  assert.equal(requests.length, 1);
  const admin = await cartesiaStatus(
    { CARTESIA_API_KEY: "test-regular", CARTESIA_ADMIN_API_KEY: "test-admin" },
    request,
  );
  assert.equal(admin.creditStatus, "usage_only");
  assert.equal(admin.dispatchEnabled, false);
  assert.equal(admin.remainingEligibleCredits, null);
  assert(!JSON.stringify(admin).includes("test-admin"));
  assert(!requests.some((url) => url.includes("tts")));
});
test("Deepgram balance-read denial is visible without leaking project data or credentials", async () => {
  const request: typeof fetch = async (url) =>
    String(url).endsWith("/projects")
      ? response({
          projects: [{ project_id: "project-private", name: "private-name" }],
        })
      : response({ error: "test-secret" }, 403);
  const status = await deepgramStatus(
    { DEEPGRAM_API_KEY: "test-secret" },
    request,
  );
  assert.equal(status.connection, "accessible");
  assert.equal(status.creditStatus, "read_denied");
  assert(status.facts.some((f) => f.includes("balance-read permission")));
  assert(!JSON.stringify(status).includes("test-secret"));
  assert(!JSON.stringify(status).includes("project-private"));
  assert(!JSON.stringify(status).includes("private-name"));
  assert.equal(status.dispatchEnabled, false);
});
test("diagnostic failures are bounded and sanitized, and reject unapproved destinations", async () => {
  const rejected = await cartesiaStatus(
    { CARTESIA_API_KEY: "test-secret" },
    async () => {
      throw new Error("test-secret provider body");
    },
  );
  assert.equal(rejected.connection, "unavailable");
  assert(!JSON.stringify(rejected).includes("test-secret"));
  await assert.rejects(
    readDiagnosticJson("https://example.com/", {}, async () => response({})),
    /PROVIDER_STATUS_UNAVAILABLE/,
  );
  const malformed = await deepgramStatus(
    { DEEPGRAM_API_KEY: "test-secret" },
    async () => new Response("secret malformed"),
  );
  assert.equal(malformed.connection, "unavailable");
  assert(!JSON.stringify(malformed).includes("secret malformed"));
});
