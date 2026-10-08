import assert from "node:assert/strict";
import test from "node:test";
import {
  inspectVideoUpload,
  backgroundLoopFrames,
} from "../../lib/domain/background-media";
import { assetRange } from "../../lib/asset-range";
import { compositionSchema } from "../../lib/domain/media";

const bytes = new TextEncoder().encode("0000ftypisom0000");
const stream = {
  codec_type: "video",
  codec_name: "h264",
  pix_fmt: "yuv420p",
  width: 1920,
  height: 1080,
  duration: "2",
  avg_frame_rate: "30000/1001",
};
const probe = {
  format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2" },
  streams: [stream],
};
test("video inspection trusts content and bounds duration, codec, pixels, frame rate and streams", () => {
  assert.deepEqual(inspectVideoUpload(bytes, probe), {
    mime: "video/mp4",
    duration: 2,
    width: 1920,
    height: 1080,
  });
  assert.equal(
    inspectVideoUpload(bytes, {
      ...probe,
      streams: [stream, { codec_type: "audio" }],
    }).duration,
    2,
  );
  for (const patch of [
    { duration: "121" },
    { duration: "NaN" },
    { duration: "0" },
    { width: 3840 },
    { height: 1920 },
    { avg_frame_rate: "120/1" },
    { avg_frame_rate: "0/0" },
    { codec_name: "hevc" },
    { pix_fmt: "yuv420p10le" },
    { disposition: { attached_pic: 1 } },
  ])
    assert.throws(() =>
      inspectVideoUpload(bytes, {
        ...probe,
        streams: [{ ...stream, ...patch }],
      }),
    );
  assert.throws(() => inspectVideoUpload(new Uint8Array(16), probe));
  assert.throws(() =>
    inspectVideoUpload(bytes, { ...probe, streams: [stream, stream] }),
  );
  assert.throws(() =>
    inspectVideoUpload(bytes, {
      ...probe,
      streams: [stream, { codec_type: "subtitle" }],
    }),
  );
  assert.deepEqual(
    inspectVideoUpload(bytes, {
      ...probe,
      streams: [{ ...stream, side_data_list: [{ rotation: 90 }] }],
    }),
    { mime: "video/mp4", duration: 2, width: 1080, height: 1920 },
  );
});
test("video snapshots require explicit version, inspected duration and dimensions; old image data stays readable", () => {
  const image = {
    id: "00000000-0000-4000-8000-000000000001",
    url: "/api/assets/example",
    checksum: "hash",
    name: "Clip",
    provenance: "Original fixture",
    mime: "video/mp4",
    kind: "video",
    duration: 1,
    width: 320,
    height: 180,
  };
  const data = {
    version: 4,
    title: "Fixture",
    scriptChecksum: "s",
    voiceChecksum: "",
    captionChecksum: "c",
    duration: 3,
    fps: 30,
    cues: [{ start: 0, end: 3, kind: "reflection", text: "One step." }],
    audioUrl: "",
    background: "forest",
    ambience: "none",
    ambienceVolume: 0,
    narrationVolume: 0,
    draft: true,
    attribution: "Fixture",
    image,
  };
  compositionSchema.parse(data);
  for (const version of [1, 2, 3])
    assert.throws(() => compositionSchema.parse({ ...data, version }));
  for (const patch of [
    { duration: undefined },
    { width: null },
    { kind: undefined },
    { mime: "video/webm" },
  ])
    assert.throws(() =>
      compositionSchema.parse({ ...data, image: { ...image, ...patch } }),
    );
  compositionSchema.parse({
    ...data,
    version: 2,
    image: {
      ...image,
      mime: "image/jpeg",
      kind: undefined,
      duration: undefined,
    },
  });
  assert.throws(() =>
    compositionSchema.parse({
      ...data,
      image: null,
      version: 3,
      sceneImages: [{ cueIndex: 0, image }],
    }),
  );
  assert.equal(backgroundLoopFrames(1.99, 30), 59);
});
test("media byte ranges support head, tail and bounded seeking without multi-range or unsafe offsets", () => {
  assert.deepEqual(assetRange(null, 100), { start: 0, end: 99, status: 200 });
  assert.deepEqual(assetRange("bytes=0-1", 100), {
    start: 0,
    end: 1,
    status: 206,
  });
  assert.deepEqual(assetRange("bytes=-12", 100), {
    start: 88,
    end: 99,
    status: 206,
  });
  assert.deepEqual(assetRange("bytes=80-200", 100), {
    start: 80,
    end: 99,
    status: 206,
  });
  for (const range of [
    "bytes=-0",
    "bytes=-",
    "bytes=100-",
    "bytes=9-2",
    "bytes=0-1,3-4",
    "bytes=9007199254740992-",
    "nonsense",
  ])
    assert.equal(assetRange(range, 100), null);
});
