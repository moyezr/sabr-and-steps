import "server-only";
import { PROVIDERS } from "@/lib/domain/providers";

export function getProviderSetup() {
  return PROVIDERS.map(({ key, ...provider }) => ({
    ...provider,
    configured:
      Boolean(process.env[key]?.trim()) &&
      (provider.id !== "quran" ||
        Boolean(process.env.QF_CLIENT_SECRET?.trim())),
  }));
}
