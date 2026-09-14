/** Original deterministic instrumental sketches. Signal synthesis only; no model or provider calls. */
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
async function main() {
  const { importAsset, listAssets } = await import(
    "../lib/server/media/assets"
  );
  const { getPool } = await import("../lib/server/db/client");
  const sampleRate = 24000,
    duration = 32;
  const presets = [
    {
      name: "Quiet dawn · gentle plucked strings",
      notes: [50, 57, 62, 65, 69, 65, 62, 57, 53, 60, 65, 69, 72, 69, 65, 60],
      pad: false,
    },
    {
      name: "Evening stillness · warm instrumental pads",
      notes: [50, 57, 60, 65, 53, 60, 65, 69, 48, 55, 60, 65, 50, 57, 62, 65],
      pad: true,
    },
  ];
  try {
    const existing = await listAssets();
    for (const preset of presets) {
      if (existing.some((a) => a.name === preset.name)) continue;
      const samples = new Float64Array(sampleRate * duration);
      preset.notes.forEach((midi, note) => {
        const start = note * 2,
          hz = 440 * Math.pow(2, (midi - 69) / 12);
        // Periodic tails wrap to the beginning, making the underlying loop continuous.
        const sustain = preset.pad ? 8 : 5;
        for (let i = 0; i < sustain * sampleRate; i++) {
          const t = i / sampleRate;
          const envelope = preset.pad
            ? Math.sin((Math.PI * t) / sustain) ** 2
            : (1 - Math.exp(-t * 40)) * Math.exp(-t * 1.15);
          const fundamental = Math.sin(2 * Math.PI * hz * t);
          const harmonics =
            0.22 * Math.sin(4 * Math.PI * hz * t) +
            0.08 * Math.sin(6 * Math.PI * hz * t);
          samples[(start * sampleRate + i) % samples.length] +=
            envelope * (fundamental + harmonics) * 0.22;
        }
      });
      const peak = samples.reduce((m, n) => Math.max(m, Math.abs(n)), 0);
      const wav = Buffer.alloc(44 + samples.length * 2);
      wav.write("RIFF", 0);
      wav.writeUInt32LE(wav.length - 8, 4);
      wav.write("WAVEfmt ", 8);
      wav.writeUInt32LE(16, 16);
      wav.writeUInt16LE(1, 20);
      wav.writeUInt16LE(1, 22);
      wav.writeUInt32LE(sampleRate, 24);
      wav.writeUInt32LE(sampleRate * 2, 28);
      wav.writeUInt16LE(2, 32);
      wav.writeUInt16LE(16, 34);
      wav.write("data", 36);
      wav.writeUInt32LE(samples.length * 2, 40);
      samples.forEach((n, i) =>
        wav.writeInt16LE(Math.round((n / peak) * 0.55 * 32767), 44 + i * 2),
      );
      const asset = await importAsset(new Uint8Array(wav), {
        kind: "audio",
        name: preset.name,
        provenance:
          "Original Sabr & Steps instrumental sketch, composed and synthesized in scripts/seed-studio-music.ts. No sampled recording, vocals, or recitation. Created for this project.",
      });
      console.log(asset.name, asset.id);
    }
  } finally {
    await getPool().end();
  }
}
void main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
