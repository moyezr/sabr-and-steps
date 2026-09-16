import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseSpeechProvider,
  type SpeechOffer,
} from "../../lib/domain/providers";

const offer = (patch: Partial<SpeechOffer> = {}): SpeechOffer => ({
  provider: "cartesia",
  capability: "narration",
  available: true,
  configured: true,
  creditsCoverRequest: true,
  commercialRights: true,
  ...patch,
});

test("prefers covered speech and does not fall through to unapproved paid usage", () => {
  assert.deepEqual(
    chooseSpeechProvider({
      capability: "narration",
      purpose: "publish",
      offers: [
        offer({ creditsCoverRequest: false }),
        offer({ provider: "elevenlabs" }),
      ],
    }),
    { provider: "elevenlabs", funding: "credits" },
  );
  assert.equal(
    chooseSpeechProvider({
      capability: "narration",
      purpose: "publish",
      offers: [offer({ creditsCoverRequest: false })],
    }),
    null,
  );
});

test("unknown balances and publishing rights fail closed", () => {
  for (const patch of [
    { creditsCoverRequest: null },
    { commercialRights: null },
    { commercialRights: false },
    { configured: false },
    { available: false },
  ]) {
    assert.equal(
      chooseSpeechProvider({
        capability: "narration",
        purpose: "publish",
        offers: [offer(patch)],
      }),
      null,
    );
  }
  assert.deepEqual(
    chooseSpeechProvider({
      capability: "narration",
      purpose: "audition",
      offers: [offer({ commercialRights: false })],
    }),
    { provider: "cartesia", funding: "credits" },
  );
});

test("an explicit voice provider stays pinned when its credit is exhausted", () => {
  assert.equal(
    chooseSpeechProvider({
      capability: "narration",
      purpose: "publish",
      preferred: "cartesia",
      offers: [
        offer({ creditsCoverRequest: false }),
        offer({ provider: "elevenlabs" }),
      ],
    }),
    null,
  );
});

test("transcription uses eligible Deepgram credit and filters other capabilities", () => {
  assert.deepEqual(
    chooseSpeechProvider({
      capability: "transcription",
      purpose: "publish",
      offers: [
        offer(),
        offer({ capability: "transcription", provider: "deepgram" }),
      ],
    }),
    { provider: "deepgram", funding: "credits" },
  );
  assert.equal(
    chooseSpeechProvider({
      capability: "transcription",
      purpose: "publish",
      offers: [offer()],
    }),
    null,
  );
});

test("paid selection requires explicit opt-in and still requires usage rights", () => {
  assert.deepEqual(
    chooseSpeechProvider({
      capability: "narration",
      purpose: "publish",
      allowPaid: true,
      offers: [offer({ creditsCoverRequest: false })],
    }),
    { provider: "cartesia", funding: "paid" },
  );
  assert.equal(
    chooseSpeechProvider({
      capability: "narration",
      purpose: "publish",
      allowPaid: true,
      offers: [offer({ commercialRights: false })],
    }),
    null,
  );
});
