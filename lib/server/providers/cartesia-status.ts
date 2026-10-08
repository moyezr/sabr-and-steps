import "server-only";
import { z } from "zod";
import type { ProviderDiagnostic } from "../../domain/provider-diagnostics";
import { deniedDiagnostic, readDiagnosticJson } from "./diagnostic-http";

export async function cartesiaStatus(
  env: Record<string, string | undefined> = process.env,
  request: typeof fetch = fetch,
): Promise<ProviderDiagnostic> {
  const configured = Boolean(env.CARTESIA_API_KEY?.trim());
  const result: ProviderDiagnostic = {
    provider: "cartesia",
    configured,
    connection: configured ? "unavailable" : "missing",
    creditStatus: "unknown",
    remainingEligibleCredits: null,
    commercialRights: null,
    dispatchEnabled: false,
    checkedAt: new Date().toISOString(),
    facts: [],
    blockers: [
      "Eligible remaining credits and applicable output rights are unverified. Cartesia generation remains unavailable.",
    ],
    sources: [
      {
        label: "Cartesia voice catalog API",
        url: "https://docs.cartesia.ai/api-reference/voices/list",
      },
      {
        label: "Cartesia credit usage API",
        url: "https://docs.cartesia.ai/api-reference/usage/credits",
      },
    ],
  };
  if (configured) {
    try {
      z.object({
        data: z.array(z.object({ id: z.string() }).passthrough()).max(100),
      }).parse(
        await readDiagnosticJson(
          "https://api.cartesia.ai/voices?limit=1",
          {
            Authorization: `Bearer ${env.CARTESIA_API_KEY}`,
            "Cartesia-Version": "2026-08-14",
          },
          request,
        ),
      );
      result.connection = "accessible";
      result.facts.push(
        "The configured key can read the voice catalog. No speech was generated.",
      );
    } catch (error) {
      result.connection = deniedDiagnostic(error) ? "denied" : "unavailable";
      result.facts.push(
        deniedDiagnostic(error)
          ? "The configured key could not access the voice catalog. Check key access."
          : "The voice catalog could not be verified. Try again later.",
      );
    }
  } else result.facts.push("CARTESIA_API_KEY is not configured.");
  if (!env.CARTESIA_ADMIN_API_KEY?.trim()) {
    result.facts.push(
      "The separate Cartesia admin key is not configured. Usage reporting requires that key.",
    );
    return result;
  }
  try {
    const usage = z
      .object({
        data: z
          .array(
            z
              .object({ credits: z.number().finite().nonnegative() })
              .passthrough(),
          )
          .max(1000),
      })
      .parse(
        await readDiagnosticJson(
          "https://api.cartesia.ai/usage/credits?interval=month",
          {
            Authorization: `Bearer ${env.CARTESIA_ADMIN_API_KEY}`,
            "Cartesia-Version": "2026-08-14",
          },
          request,
        ),
      );
    result.creditStatus = "usage_only";
    result.facts.push(
      `The admin usage report returned ${usage.data.length} usage buckets. Used credits do not establish a remaining grant or plan allowance.`,
    );
  } catch (error) {
    result.creditStatus = deniedDiagnostic(error) ? "read_denied" : "unknown";
    result.facts.push(
      deniedDiagnostic(error)
        ? "The admin key cannot read usage. Review its permissions."
        : "Credit usage could not be verified.",
    );
  }
  return result;
}
