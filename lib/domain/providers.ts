export const PROVIDERS = [
  {
    id: "openrouter",
    name: "OpenRouter",
    role: "Script writing",
    key: "OPENROUTER_API_KEY",
    initials: "OR",
    note: "GPT-5.6 Luna or Gemini 3.8 Flash. Speech uses dedicated providers.",
  },
  {
    id: "cartesia",
    name: "Cartesia",
    role: "Narration",
    key: "CARTESIA_API_KEY",
    initials: "C",
    note: "Included credits first. Confirm commercial rights before publishing.",
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    role: "Narration",
    key: "ELEVEN_LABS_API_KEY",
    initials: "II",
    note: "Included credits first. Free-plan audio is for noncommercial use.",
  },
  {
    id: "deepgram",
    name: "Deepgram",
    role: "Caption timing · narration",
    key: "DEEPGRAM_API_KEY",
    initials: "D",
    note: "Use available credit for transcription and voice auditions.",
  },
  {
    id: "quran",
    name: "Quran Foundation",
    role: "Qur’an sources",
    key: "QF_CLIENT_ID",
    initials: "Q",
    note: "Canonical translations and references. Inspect imported editions and coverage in Sources.",
  },
  {
    id: "sunnah",
    name: "Sunnah.com",
    role: "Hadith sources",
    key: "SUNNAH_API_KEY",
    initials: "S",
    note: "API access requested. The Qur’an workflow can proceed while we wait.",
  },
] as const;

export type SpeechProvider = "cartesia" | "elevenlabs" | "deepgram";
export type SpeechOffer = {
  provider: SpeechProvider;
  capability: "narration" | "transcription";
  configured: boolean;
  available: boolean;
  creditsCoverRequest: boolean | null;
  commercialRights: boolean | null;
};

/** No OpenRouter speech fallback. Unknown balances are not available credits. */
export function chooseSpeechProvider(options: {
  capability: SpeechOffer["capability"];
  purpose: "audition" | "publish";
  offers: SpeechOffer[];
  preferred?: SpeechProvider;
  allowPaid?: boolean;
}): { provider: SpeechProvider; funding: "credits" | "paid" } | null {
  const order: SpeechProvider[] =
    options.capability === "transcription"
      ? ["deepgram", "cartesia", "elevenlabs"]
      : ["cartesia", "elevenlabs", "deepgram"];
  const eligible = options.offers
    .filter(
      (offer) =>
        offer.configured &&
        offer.available &&
        offer.capability === options.capability &&
        (!options.preferred || offer.provider === options.preferred) &&
        (options.purpose !== "publish" || offer.commercialRights === true),
    )
    .sort((a, b) => order.indexOf(a.provider) - order.indexOf(b.provider));
  const covered = eligible.find((offer) => offer.creditsCoverRequest === true);
  if (covered) return { provider: covered.provider, funding: "credits" };
  if (options.allowPaid && eligible.length)
    return { provider: eligible[0].provider, funding: "paid" };
  return null;
}
