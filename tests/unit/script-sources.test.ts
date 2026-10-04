import assert from "node:assert/strict";
import test from "node:test";
import { scriptSourceQuerySchema } from "../../lib/domain/script-sources";

const importId = "d3d44b89-915d-4e46-ab13-5e9a1617cfed";

test("source search normalizes words and verse identity with bounded defaults", () => {
  assert.deepEqual(
    scriptSourceQuerySchema.parse({
      importId,
      q: "  patience  ",
      chapter: "2",
      reference: " 002:003 ",
    }),
    { importId, q: "patience", chapter: 2, reference: "2:3", page: 1 },
  );
  assert.equal(
    scriptSourceQuerySchema.parse({
      importId,
      reference: "114:286",
      page: "400",
    }).page,
    400,
  );
});

test("source search rejects invalid references instead of falling back to words", () => {
  for (const reference of [
    "2",
    "2:0",
    "0:1",
    "115:1",
    "2:287",
    "2:3-5",
    "2:3:4",
    "words",
  ]) {
    assert.equal(
      scriptSourceQuerySchema.safeParse({ importId, q: "patience", reference })
        .success,
      false,
      reference,
    );
  }
});

test("source search rejects oversized words, unknown imports, and unsafe pagination", () => {
  assert.equal(
    scriptSourceQuerySchema.safeParse({ importId, q: "a".repeat(200) }).success,
    true,
  );
  assert.equal(
    scriptSourceQuerySchema.safeParse({ importId, q: "a".repeat(201) }).success,
    false,
  );
  assert.equal(
    scriptSourceQuerySchema.safeParse({ importId: "unknown" }).success,
    false,
  );
  assert.equal(scriptSourceQuerySchema.safeParse({}).success, false);
  for (const page of ["0", "-1", "401", "1.5", "Infinity", "words"]) {
    assert.equal(
      scriptSourceQuerySchema.safeParse({ importId, page }).success,
      false,
      page,
    );
  }
  for (const chapter of ["0", "115", "1.5", "words"]) {
    assert.equal(
      scriptSourceQuerySchema.safeParse({ importId, chapter }).success,
      false,
      chapter,
    );
  }
});
