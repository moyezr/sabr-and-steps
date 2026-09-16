import assert from "node:assert/strict";
import test from "node:test";
import { canonicalText, parseReference } from "../../lib/domain/source";
import { QuranClient, QuranError } from "../../lib/server/providers/quran";
import { digest, validateChapter } from "../../lib/server/sources/importer";

test("canonical formatting preserves text, entities and visible footnote markers, rejects unsupported HTML", () => {
  assert.equal(
    canonicalText('A <i>synthetic</i> &amp; test.<sup foot_note="42">1</sup>'),
    "A synthetic & test. [footnote 1]",
  );
  assert.equal(canonicalText("&#8220;Test&#8221;"), "“Test”");
  assert.throws(() => canonicalText("<script>bad()</script>"));
  assert.throws(() => canonicalText(""));
  assert.deepEqual(parseReference("2:153"), { chapter: 2, verse: 153 });
  for (const ref of ["0:1", "115:1", "2:0", "2:287", "bad", "2:1<script>"])
    assert.equal(parseReference(ref), null);
  assert.equal(digest({ a: 1, b: 2 }), digest({ b: 2, a: 1 }));
});

test("source boundary rejects incomplete chapters, fabricated references, and incorrect editions", () => {
  const chapter = { id: 1, name_simple: "Synthetic", verses_count: 1 };
  const v = {
    verse_key: "1:1",
    verse_number: 1,
    text_uthmani: "اختبار",
    translations: [
      { resource_id: 85, text: "Synthetic fixture, not scripture." },
    ],
  };
  const page = {
    verses: [v],
    pagination: {
      current_page: 1,
      next_page: null,
      total_pages: 1,
      total_records: 1,
    },
  };
  assert.equal(validateChapter([page], chapter, 85)[0].reference, "1:1");
  assert.throws(
    () => validateChapter([], chapter, 85),
    /QF_INCOMPLETE_CHAPTER/,
  );
  assert.throws(
    () =>
      validateChapter(
        [{ ...page, verses: [{ ...v, verse_key: "2:1" }] }],
        chapter,
        85,
      ),
    /QF_REFERENCE_MISMATCH/,
  );
  assert.throws(
    () => validateChapter([page], chapter, 20),
    /QF_TRANSLATION_MISSING/,
  );
});

const env = {
  QF_CLIENT_ID: "fixture-id",
  QF_CLIENT_SECRET: "fixture-secret",
  QF_ENV: "prelive",
};
test("QF client uses matching environment, caches tokens and retries authentication once", async () => {
  let tokens = 0,
    gets = 0;
  const fake: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/oauth2/token")) {
      tokens++;
      assert(url.startsWith("https://prelive-oauth2.quran.foundation/"));
      return Response.json({
        access_token: `fixture-${tokens}`,
        expires_in: 3600,
      });
    }
    assert(
      url.startsWith("https://apis-prelive.quran.foundation/content/api/v4/"),
    );
    assert.equal(
      (init?.headers as Record<string, string>)["x-client-id"],
      "fixture-id",
    );
    gets++;
    return gets === 1
      ? new Response(null, { status: 401 })
      : Response.json({ ok: true });
  };
  const client = new QuranClient(env, fake);
  await client.get("chapters");
  await client.get("chapters");
  assert.equal(tokens, 2);
  assert.equal(gets, 3);
  assert.throws(
    () => new QuranClient({ ...env, QF_ENV: "other" }),
    /QF_ENV_INVALID/,
  );
});
test("QF auth and network failures stay bounded and do not expose provider bodies or secrets", async () => {
  let calls = 0;
  const client = new QuranClient(env, async () => {
    calls++;
    return new Response("fixture-secret", { status: 401 });
  });
  await assert.rejects(
    client.resources(),
    (e: unknown) => e instanceof QuranError && e.message === "QF_AUTH_FAILED",
  );
  assert.equal(calls, 1);
  const network = new QuranClient(env, async () => {
    throw new Error("fixture-secret");
  });
  await assert.rejects(network.resources(), /QF_NETWORK_ERROR/);
});
