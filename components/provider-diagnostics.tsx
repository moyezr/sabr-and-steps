"use client";
import { useEffect, useRef, useState } from "react";
import type { ProviderDiagnostic } from "@/lib/domain/provider-diagnostics";
export function ProviderDiagnostics() {
  const [diagnostics, setDiagnostics] = useState<ProviderDiagnostic[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function check() {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/providers/diagnostics", {
        method: "POST",
        signal: request.signal,
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error || "Provider connections could not be checked.",
        );
      if (request.signal.aborted) return;
      setDiagnostics(body.diagnostics);
    } catch (caught) {
      if (!request.signal.aborted)
        setError(
          caught instanceof Error
            ? caught.message
            : "Provider connections could not be checked.",
        );
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  }
  return (
    <section className="panel" aria-label="Read-only speech provider checks">
      <h2>Check provider access</h2>
      <p>
        Check Cartesia and Deepgram connections and balance-read permissions.
        This reads account metadata without generating speech or submitting
        audio.
      </p>
      <button
        type="button"
        className="secondary-button"
        disabled={busy}
        onClick={() => void check()}
      >
        {busy ? "Checking provider access…" : "Check configured connections"}
      </button>
      {error && (
        <p role="alert" className="status-message">
          {error}
        </p>
      )}
      {busy && (
        <p role="status">Reading provider access and quota permissions…</p>
      )}
      {diagnostics.map((item) => (
        <article key={item.provider} className="provider-card">
          <h3>
            {item.provider === "cartesia" ? "Cartesia" : "Deepgram"} ·{" "}
            {item.connection.replaceAll("_", " ")}
          </h3>
          <p>
            Checked {new Date(item.checkedAt).toLocaleString()} · Generation
            remains unavailable.
          </p>
          <ul>
            {item.facts.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
          <p>
            Eligible remaining credit: unverified · Commercial rights:
            unverified.
          </p>
          <ul>
            {item.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
          <p>
            {item.sources.map((source, index) => (
              <span key={source.url}>
                {index > 0 ? " · " : ""}
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-link"
                >
                  {source.label}
                </a>
              </span>
            ))}
          </p>
        </article>
      ))}
    </section>
  );
}
