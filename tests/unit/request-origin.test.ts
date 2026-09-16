import assert from "node:assert/strict";
import test from "node:test";
import { mutationAllowed } from "../../lib/domain/request-origin";

test("accepts browser Host even when Next normalizes request.url", () => {
  const request = new Request("http://localhost:3107/api/episodes", {
    headers: {
      host: "127.0.0.1:3107",
      origin: "http://127.0.0.1:3107",
      "sec-fetch-site": "same-origin",
    },
  });
  assert.equal(mutationAllowed(request), true);
});

test("rejects cross-site, missing origin, foreign hostnames, and port mismatches", () => {
  for (const headers of [
    { host: "127.0.0.1:3107" },
    { host: "127.0.0.1:3107", origin: "null" },
    { host: "127.0.0.1:3107", origin: "https://evil.example" },
    { host: "127.0.0.1:3107", origin: "http://127.0.0.1:3108" },
    { host: "evil.example", origin: "http://evil.example" },
    {
      host: "127.0.0.1:3107",
      origin: "http://127.0.0.1:3107",
      "sec-fetch-site": "cross-site",
    },
  ])
    assert.equal(
      mutationAllowed(
        new Request("http://localhost:3107/api/episodes", {
          headers: headers as HeadersInit,
        }),
      ),
      false,
    );
});
