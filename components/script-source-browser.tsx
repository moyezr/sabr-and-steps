"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { BookOpen, Search, X } from "lucide-react";
import type { ScriptBlock } from "@/lib/domain/script";
import type { ScriptSourceResponse } from "@/lib/domain/script-sources";
import { parseReference } from "@/lib/domain/source";

type Props = {
  episodeId: string;
  importId: string;
  canInsert: boolean;
  replacement?: { index: number; reference: string } | null;
  onInsert: (block: ScriptBlock) => void;
  onReplace: (block: ScriptBlock) => void;
  onCancelReplace: () => void;
};

type SearchQuery = {
  q: string;
  chapter: string;
  reference: string;
  page: number;
};

async function readSources(
  episodeId: string,
  importId: string,
  query: Partial<SearchQuery>,
  signal: AbortSignal,
) {
  const params = new URLSearchParams({ importId });
  for (const [key, value] of Object.entries(query)) {
    if (value !== "") params.set(key, String(value));
  }
  const response = await fetch(`/api/episodes/${episodeId}/sources?${params}`, {
    cache: "no-store",
    signal,
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error || "Saved sources could not be loaded.");
  return body as ScriptSourceResponse;
}

// Switching edition or episode unmounts the old searches and inspected context.
export function ScriptSourceBrowser(props: Props) {
  return (
    <SourceBrowser key={`${props.episodeId}:${props.importId}`} {...props} />
  );
}

function SourceBrowser({
  episodeId,
  importId,
  canInsert,
  replacement,
  onInsert,
  onReplace,
  onCancelReplace,
}: Props) {
  const helpId = useId();
  const [words, setWords] = useState("");
  const [chapter, setChapter] = useState("");
  const [reference, setReference] = useState("");
  const [query, setQuery] = useState<SearchQuery>({
    q: "",
    chapter: "",
    reference: "",
    page: 1,
  });
  const [results, setResults] = useState<ScriptSourceResponse | null>(null);
  const [catalog, setCatalog] = useState<ScriptSourceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [contextReference, setContextReference] = useState("");
  const [contextAttempt, setContextAttempt] = useState(0);
  const [context, setContext] = useState<ScriptSourceResponse | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState("");
  const [notice, setNotice] = useState("");
  const contextHeading = useRef<HTMLHeadingElement>(null);
  const searchController = useRef<AbortController | null>(null);
  const contextController = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    searchController.current = controller;
    void readSources(episodeId, importId, query, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setResults(data);
        setCatalog(data);
        setLoading(false);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Saved sources could not be loaded.",
        );
        setLoading(false);
      });
    return () => controller.abort();
  }, [episodeId, importId, query]);

  useEffect(() => {
    if (!contextReference) return;
    const controller = new AbortController();
    contextController.current = controller;
    contextHeading.current?.focus();
    void readSources(
      episodeId,
      importId,
      { reference: contextReference, page: 1 },
      controller.signal,
    )
      .then((data) => {
        if (controller.signal.aborted) return;
        setContext(data);
        setContextLoading(false);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setContextError(
          caught instanceof Error
            ? caught.message
            : "Surrounding context could not be loaded.",
        );
        setContextLoading(false);
      });
    return () => controller.abort();
  }, [episodeId, importId, contextReference, contextAttempt]);

  function clearContext() {
    contextController.current?.abort();
    setContextReference("");
    setContext(null);
    setContextError("");
    setContextLoading(false);
  }

  function runSearch(next: SearchQuery) {
    searchController.current?.abort();
    clearContext();
    setNotice("");
    setError("");
    setResults(null);
    setLoading(true);
    setQuery(next);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = reference.trim() ? parseReference(reference.trim()) : null;
    if (reference.trim() && !parsed) {
      clearContext();
      setError("Enter a reference such as 2:153 (chapter:verse).");
      return;
    }
    runSearch({
      q: words.trim(),
      chapter,
      reference: parsed ? `${parsed.chapter}:${parsed.verse}` : "",
      page: 1,
    });
  }

  function inspect(nextReference: string) {
    contextController.current?.abort();
    setNotice("");
    setContext(null);
    setContextError("");
    setContextLoading(true);
    setContextReference(nextReference);
    setContextAttempt((attempt) => attempt + 1);
  }

  const edition = catalog?.edition || context?.edition;
  const selectedSource = context?.referenceFound
    ? context.rows.find((row) => row.reference === contextReference)
    : undefined;
  const pages = results ? Math.ceil(results.total / 20) : 0;

  function adoptSource() {
    if (!canInsert || !selectedSource || !context) return;
    const block: ScriptBlock = {
      kind: "quote",
      text: selectedSource.text,
      sourceId: selectedSource.id,
      reference: selectedSource.reference,
      edition: context.edition.name,
      importId: context.edition.id,
    };
    if (replacement) onReplace(block);
    else onInsert(block);
    setNotice(
      `Qur’an ${block.reference} ${replacement ? "replaced the selected quotation" : "was added to the script"}. Save a named version after reviewing your changes.`,
    );
  }

  return (
    <section
      className="panel script-source-browser"
      aria-label="Find canonical sources"
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow">CANONICAL SOURCES</span>
          <h2>
            <BookOpen size={18} /> Find a passage
          </h2>
        </div>
      </div>
      <p>
        Search this script’s edition, inspect the surrounding verses, then add
        the full translation to your script.
      </p>
      {edition && (
        <div className="script-source-provenance">
          <strong>{edition.name}</strong>
          <p>Translator as supplied: {edition.author} · English translation</p>
          <p>
            {edition.coverage} of 114 chapters available ·{" "}
            {edition.environment === "prelive" ? "Pre-live" : "Production"}{" "}
            environment
          </p>
          <p className="source-notice">
            {edition.rightsStatus === "cleared"
              ? "Edition reuse cleared."
              : "Publication reuse is not cleared. Private draft inspection only."}
            {edition.coverage < 114 &&
              " Missing chapters are unavailable in this import."}
          </p>
        </div>
      )}
      {replacement && (
        <div className="source-notice script-source-replacement" role="status">
          <span>
            Choose a passage to replace block {replacement.index + 1}, Qur’an{" "}
            {replacement.reference}.
          </span>
          <button className="text-link" type="button" onClick={onCancelReplace}>
            Cancel replacement
          </button>
        </div>
      )}
      <form className="script-source-filters" onSubmit={submitSearch}>
        <label>
          Words in translation
          <input
            value={words}
            maxLength={200}
            placeholder="e.g. patience"
            onChange={(event) => setWords(event.target.value)}
          />
        </label>
        <label>
          Chapter
          <select
            value={chapter}
            onChange={(event) => setChapter(event.target.value)}
          >
            <option value="">All imported chapters</option>
            {catalog?.chapters.map((item) => (
              <option key={item.chapter} value={item.chapter}>
                {item.chapter}. {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Verse reference
          <input
            value={reference}
            maxLength={7}
            placeholder="e.g. 2:153"
            aria-describedby={helpId}
            onChange={(event) => setReference(event.target.value)}
          />
        </label>
        <div className="script-source-search-actions">
          <button className="button" type="submit">
            <Search size={14} /> {loading ? "Searching…" : "Find sources"}
          </button>
          <button
            className="text-link"
            type="button"
            onClick={() => {
              setWords("");
              setChapter("");
              setReference("");
              runSearch({ q: "", chapter: "", reference: "", page: 1 });
            }}
          >
            Clear filters
          </button>
        </div>
        <p id={helpId} className="source-filter-help">
          A reference opens up to two verses before and after it and overrides
          the chapter and word filters.
        </p>
      </form>
      {error && (
        <p className="source-notice" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="source-notice" role="status">
          {notice}
        </p>
      )}
      {contextReference && (
        <section
          className="script-source-context"
          aria-label={`Context for Qur’an ${contextReference}`}
        >
          <div className="section-heading">
            <h3 ref={contextHeading} tabIndex={-1}>
              Context for Qur’an {contextReference}
            </h3>
            <button className="text-link" type="button" onClick={clearContext}>
              <X size={14} /> Close context
            </button>
          </div>
          <p>
            Read the selected verse with the surrounding passage before
            inserting it. Source text is preserved in full.
          </p>
          {contextLoading && <p role="status">Loading surrounding verses…</p>}
          {contextError && (
            <div className="source-notice" role="alert">
              {contextError}{" "}
              <button
                className="text-link"
                type="button"
                onClick={() => inspect(contextReference)}
              >
                Retry context
              </button>
            </div>
          )}
          {context && !selectedSource && (
            <p className="source-notice">
              This verse is unavailable in the selected import. Try another
              reference; missing coverage does not establish relevance.
            </p>
          )}
          {context?.rows.map((row) => (
            <article
              className={`script-source-passage ${row.reference === contextReference ? "source-selected" : ""}`}
              key={row.id}
              translate="no"
            >
              <h4>
                Qur’an {row.reference} · {row.chapterName}
                {row.reference === contextReference && (
                  <span className="eyebrow">Selected verse</span>
                )}
              </h4>
              <p className="source-translation">{row.text}</p>
            </article>
          ))}
          {selectedSource && context && (
            <div className="script-source-adopt">
              <p>
                {context.edition.name} · {context.edition.author} · Qur’an{" "}
                {selectedSource.reference}
              </p>
              <button
                className="button primary-action"
                type="button"
                disabled={!canInsert}
                onClick={adoptSource}
              >
                {replacement
                  ? "Replace quotation with full verse"
                  : "Insert full verse"}
              </button>
              {!canInsert && (
                <p>
                  Finish the current action or make room in the script before
                  adding a verse.
                </p>
              )}
            </div>
          )}
        </section>
      )}
      <p role="status" className="script-source-results-status">
        {loading
          ? "Loading saved sources…"
          : results
            ? query.reference
              ? `Surrounding passage for Qur’an ${query.reference}`
              : `${results.total} matching verses`
            : ""}
      </p>
      {results && (!results.referenceFound || !results.rows.length) ? (
        <div className="script-source-empty">
          <h3>No source found in this import.</h3>
          <p>
            Try another search. Missing coverage is not evidence that the Qur’an
            has no relevant passage.
          </p>
        </div>
      ) : (
        results?.rows.map((row) => (
          <article
            className="script-source-passage"
            key={row.id}
            translate="no"
          >
            <h3>
              Qur’an {row.reference} · {row.chapterName}
            </h3>
            <p className="source-translation">{row.text}</p>
            <button
              className="text-link"
              type="button"
              onClick={() => inspect(row.reference)}
            >
              Inspect context for {row.reference}
            </button>
          </article>
        ))
      )}
      {!loading && results && !query.reference && pages > 1 && (
        <nav
          className="source-pagination"
          aria-label="Script source results pages"
        >
          <button
            className="button"
            type="button"
            disabled={query.page <= 1}
            onClick={() => runSearch({ ...query, page: query.page - 1 })}
          >
            Previous
          </button>
          <span>
            Page {query.page} of {pages}
          </span>
          <button
            className="button"
            type="button"
            disabled={query.page >= pages || query.page >= 400}
            onClick={() => runSearch({ ...query, page: query.page + 1 })}
          >
            Next
          </button>
        </nav>
      )}
    </section>
  );
}
