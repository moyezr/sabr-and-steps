import "server-only";
import { z } from "zod";
import type { ProviderDiagnostic } from "../../domain/provider-diagnostics";
import { deniedDiagnostic, readDiagnosticJson } from "./diagnostic-http";

export async function deepgramStatus(
  env: Record<string, string | undefined> = process.env,
  request: typeof fetch = fetch,
): Promise<ProviderDiagnostic> {
  const configured = Boolean(env.DEEPGRAM_API_KEY?.trim());
  const result: ProviderDiagnostic = {
    provider: "deepgram",
    configured,
    connection: configured ? "unavailable" : "missing",
    creditStatus: "unknown",
    remainingEligibleCredits: null,
    commercialRights: null,
    dispatchEnabled: false,
    checkedAt: new Date().toISOString(),
    facts: [],
    blockers: [
      "An eligible grant balance, expiration, pricing and output rights must be verified before speech or transcription dispatch.",
    ],
    sources: [
      {
        label: "Deepgram project access",
        url: "https://developers.deepgram.com/reference/manage/projects/list",
      },
      {
        label: "Deepgram balance API",
        url: "https://developers.deepgram.com/reference/manage/billing/list",
      },
    ],
  };
  if (!configured) {
    result.facts.push("DEEPGRAM_API_KEY is not configured.");
    return result;
  }
  const headers = { Authorization: `Token ${env.DEEPGRAM_API_KEY}` };
  try {
    const response = z
      .object({
        projects: z
          .array(
            z.object({ project_id: z.string().min(1).max(100) }).passthrough(),
          )
          .max(1000),
      })
      .parse(
        await readDiagnosticJson(
          "https://api.deepgram.com/v1/projects",
          headers,
          request,
        ),
      );
    result.connection = "accessible";
    result.facts.push(
      `The configured key can list ${response.projects.length} accessible projects. No audio was submitted.`,
    );
    if (!response.projects.length) {
      result.facts.push("No project is available for a balance check.");
      return result;
    }
    const balances = await Promise.allSettled(
      response.projects
        .slice(0, 3)
        .map(async (project) =>
          z
            .object({
              balances: z
                .array(
                  z
                    .object({
                      amount: z.number().finite(),
                      units: z.string().max(20),
                    })
                    .passthrough(),
                )
                .max(1000),
            })
            .parse(
              await readDiagnosticJson(
                `https://api.deepgram.com/v1/projects/${encodeURIComponent(project.project_id)}/balances`,
                headers,
                request,
              ),
            ),
        ),
    );
    const allowed = balances.filter(
      (balance) => balance.status === "fulfilled",
    ).length;
    const denied = balances.filter(
      (balance) =>
        balance.status === "rejected" && deniedDiagnostic(balance.reason),
    ).length;
    result.creditStatus = denied
      ? "read_denied"
      : allowed === balances.length
        ? "reported_balances"
        : "unknown";
    if (denied)
      result.facts.push(
        `Balance access was denied for ${denied} checked projects. The key needs project billing balance-read permission.`,
      );
    if (allowed)
      result.facts.push(
        `Balance reads succeeded for ${allowed} checked projects. A reported monetary balance does not identify an eligible grant, its expiry, or per-request cost.`,
      );
    if (!allowed && !denied)
      result.facts.push(
        "Project balances could not be verified. Try again later.",
      );
    if (response.projects.length > 3)
      result.facts.push(
        "This bounded check inspected only the first three accessible projects.",
      );
  } catch (error) {
    result.connection = deniedDiagnostic(error) ? "denied" : "unavailable";
    result.facts.push(
      deniedDiagnostic(error)
        ? "Project access was denied. Review API key project permissions."
        : "Project access could not be verified. Try again later.",
    );
  }
  return result;
}
