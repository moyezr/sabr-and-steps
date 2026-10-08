export type ProviderDiagnostic = {
  provider: "cartesia" | "deepgram";
  configured: boolean;
  connection: "missing" | "accessible" | "denied" | "unavailable";
  creditStatus: "unknown" | "read_denied" | "usage_only" | "reported_balances";
  remainingEligibleCredits: null;
  commercialRights: null;
  dispatchEnabled: false;
  checkedAt: string;
  facts: string[];
  blockers: string[];
  sources: { label: string; url: string }[];
};
