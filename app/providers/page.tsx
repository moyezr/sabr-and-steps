import {
  ArrowUpRight,
  AudioLines,
  Coins,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { getProviderSetup } from "@/lib/server/providers/setup";

export const dynamic = "force-dynamic";

export default function ProvidersPage() {
  const providers = getProviderSetup();
  return (
    <>
      <div className="page-topline">
        <span className="eyebrow">THE TOOLS BEHIND YOUR REMINDERS</span>
        <span className="local-label">
          <span className="status-dot" /> Local workspace
        </span>
      </div>
      <header className="page-heading">
        <div>
          <div className="eyebrow">PROVIDERS</div>
          <h1>
            Thoughtful tools.
            <br />
            <em>Mindful spending.</em>
          </h1>
          <p>
            Use the right service for each step, and make your credits go
            further.
          </p>
        </div>
        <div className="header-symbol">
          <AudioLines size={32} strokeWidth={1.1} />
        </div>
      </header>
      <div className="provider-policy">
        <div>
          <Coins size={20} />
          <h3>Credits before extra spend</h3>
          <p>
            Speech selection will prefer eligible included credits. A missing
            balance never counts as free credit.
          </p>
        </div>
        <div>
          <ShieldCheck size={20} />
          <h3>The right use, the right voice</h3>
          <p>
            Private auditions and publishable narration have separate usage
            requirements. Keep one voice per take.
          </p>
        </div>
        <div>
          <LockKeyhole size={20} />
          <h3>No surprise fallback</h3>
          <p>
            Speech will not silently switch to OpenRouter. Script models are
            limited to Luna and Gemini Flash.
          </p>
        </div>
      </div>
      <div className="section-heading">
        <div>
          <h2>Your services</h2>
          <p>
            Key presence is checked locally. Speech balances remain unverified;
            source import results are recorded in Sources.
          </p>
        </div>
        <span className="count-label">
          {providers.filter((provider) => provider.configured).length} OF{" "}
          {providers.length} KEYS ADDED
        </span>
      </div>
      <div className="provider-grid">
        {providers.map((provider) => (
          <article className="provider-card panel" key={provider.id}>
            <div className="provider-card-top">
              <span className={`provider-avatar ${provider.id}`}>
                {provider.initials}
              </span>
              <span className={`pill ${provider.configured ? "" : "waiting"}`}>
                <span className="status-dot" />
                {provider.configured ? "Key added" : "Awaiting access"}
              </span>
            </div>
            <h3>{provider.name}</h3>
            <div className="provider-role">{provider.role}</div>
            <p>{provider.note}</p>
            <div className="provider-card-foot">
              {provider.id === "quran"
                ? "View import results in Sources"
                : provider.id === "sunnah"
                  ? "Source connection pending"
                  : "Balance not checked"}
              <ArrowUpRight size={14} />
            </div>
          </article>
        ))}
      </div>
      <div className="provider-footnote">
        Keys stay on the server. This page shows configuration status; it does
        not make billable requests. Speech generation is a later stage.
      </div>
    </>
  );
}
