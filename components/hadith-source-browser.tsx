"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ScriptBlock } from "@/lib/domain/script";
import {
  createManualHadithImportTemplate,
  type HadithBrowseResponse,
  type HadithPassage,
} from "@/lib/domain/hadith";
import styles from "./hadith-source-browser.module.css";

type SelectionProps = {
  episodeId: string;
  canInsert: boolean;
  replacement?: { index: number; reference: string } | null;
  onInsert: (block: ScriptBlock) => void;
  onReplace: (block: ScriptBlock) => void;
  onCancelReplace: () => void;
};
type Query = { importId: string; q: string; collection: string; page: number };

export function HadithSourceBrowser(props: SelectionProps) {
  return <HadithBrowser key={props.episodeId} selection={props} />;
}
export function HadithLibrary() {
  return <HadithBrowser />;
}

function HadithBrowser({ selection }: { selection?: SelectionProps }) {
  const [query, setQuery] = useState<Query>({
    importId: "",
    q: "",
    collection: "",
    page: 1,
  });
  const [words, setWords] = useState("");
  const [collection, setCollection] = useState("");
  const [catalog, setCatalog] = useState<HadithBrowseResponse | null>(null);
  const [results, setResults] = useState<HadithBrowseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [inspected, setInspected] = useState<HadithPassage | null>(null);
  const [reviewer, setReviewer] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [manualJson, setManualJson] = useState("");
  const controller = useRef<AbortController | null>(null);
  const reviewController = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const request = new AbortController();
    controller.current = request;
    const params = new URLSearchParams({ page: String(query.page) });
    if (query.importId) params.set("importId", query.importId);
    if (query.q) params.set("q", query.q);
    if (query.collection) params.set("collection", query.collection);
    void fetch(`/api/hadith?${params}`, {
      cache: "no-store",
      signal: request.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || "Hadith sources could not be loaded.");
        if (request.signal.aborted) return;
        setCatalog(body);
        setResults(body);
        setLoading(false);
      })
      .catch((caught: unknown) => {
        if (request.signal.aborted) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Hadith sources unavailable.",
        );
        setLoading(false);
      });
    return () => request.abort();
  }, [query]);
  useEffect(() => () => reviewController.current?.abort(), []);
  useEffect(() => {
    if (inspected) heading.current?.focus();
  }, [inspected]);
  useEffect(() => {
    if (!manualJson) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [manualJson]);

  function search(next: Query) {
    controller.current?.abort();
    reviewController.current?.abort();
    setInspected(null);
    setResults(null);
    setLoading(true);
    setBusy(false);
    setError("");
    setNotice("");
    setQuery(next);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    search({
      importId: catalog?.selected?.id || query.importId,
      q: words.trim(),
      collection,
      page: 1,
    });
  }
  async function review() {
    if (!inspected) return;
    reviewController.current?.abort();
    const request = new AbortController();
    reviewController.current = request;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/hadith", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: request.signal,
        body: JSON.stringify({
          action: "review",
          data: {
            sourceId: inspected.id,
            importId: inspected.importId,
            reviewedBy: reviewer,
            notes: reviewNotes,
          },
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Review could not be saved.");
      if (request.signal.aborted) return;
      setInspected(body);
      setNotice(
        "Context review recorded for this exact source record. Publication permission remains a separate review.",
      );
    } catch (caught) {
      if (request.signal.aborted) return;
      setError(
        caught instanceof Error ? caught.message : "Review could not be saved.",
      );
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  }
  function adopt() {
    if (
      !selection?.canInsert ||
      !inspected ||
      inspected.reviewState !== "reviewed" ||
      !catalog?.selected ||
      catalog.selected.id !== inspected.importId
    )
      return;
    const block: ScriptBlock = {
      kind: "quote",
      sourceKind: "hadith",
      text: inspected.text,
      sourceId: inspected.id,
      reference: inspected.reference,
      edition: catalog.selected.edition,
      importId: inspected.importId,
    };
    if (selection.replacement) selection.onReplace(block);
    else selection.onInsert(block);
    setNotice(
      `${inspected.reference} adopted with its complete wording and source attribution. Save a named script version after reviewing your edits.`,
    );
  }
  async function importManual(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/hadith", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "import",
          data: JSON.parse(manualJson),
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Import could not be saved.");
      setManualJson("");
      search({ importId: body.id, q: "", collection: "", page: 1 });
      setNotice(
        body.cached
          ? "Identical reviewed import reused. Earlier source IDs remain unchanged."
          : "Reviewed records imported as a separate immutable source version.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Use valid reviewed-record JSON.",
      );
    } finally {
      setBusy(false);
    }
  }
  const edition = catalog?.selected;
  return (
    <section
      className={`panel ${styles.library}`}
      aria-label="Hadith source library"
    >
      <div>
        <span className="eyebrow">HADITH · TRACEABLE REPORTS</span>
        <h2>Hadith sources</h2>
      </div>
      {selection && (
        <Link className="text-link" href="/sources/hadith">
          Import and inspect hadith records
        </Link>
      )}
      {catalog && (
        <p className={styles.notice}>
          {catalog.providerAvailable
            ? "Sunnah.com key configured. Provider imports use the foreground import command."
            : "Sunnah.com API key is not configured. Reviewed manual imports are available; API coverage is not claimed."}
        </p>
      )}
      {selection?.replacement && (
        <div className={styles.notice}>
          Replacing block {selection.replacement.index + 1},{" "}
          {selection.replacement.reference}.{" "}
          <button
            type="button"
            className="text-link"
            onClick={selection.onCancelReplace}
          >
            Cancel replacement
          </button>
        </div>
      )}
      {edition && (
        <div className={styles.notice}>
          <strong>{edition.edition}</strong>
          <p>
            Translator: {edition.translator || "Not supplied"} ·{" "}
            {edition.recordCount} imported reports
          </p>
          <p>{edition.coverageNotes}</p>
          <p>
            {edition.rightsStatus === "cleared"
              ? "Publication reuse cleared in the supplied rights record."
              : "Publication reuse not cleared."}{" "}
            {edition.rightsNotes}
          </p>
          <p>{edition.provenance}</p>
        </div>
      )}
      <form className={styles.filters} onSubmit={submit}>
        <label>
          Source version
          <select
            value={edition?.id || ""}
            disabled={busy}
            onChange={(event) => {
              setCollection("");
              search({
                importId: event.target.value,
                q: "",
                collection: "",
                page: 1,
              });
            }}
          >
            <option value="">Choose an import</option>
            {catalog?.imports.map((item) => (
              <option key={item.id} value={item.id}>
                {item.edition} · {item.recordCount} reports ·{" "}
                {item.createdAt.slice(0, 10)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Collection
          <select
            value={collection}
            onChange={(event) => setCollection(event.target.value)}
          >
            <option value="">All imported collections</option>
            {catalog?.collections.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Words in full report
          <input
            value={words}
            maxLength={200}
            onChange={(event) => setWords(event.target.value)}
            placeholder="e.g. patience"
          />
        </label>
        <button className="button" type="submit" disabled={busy}>
          Find hadith
        </button>
      </form>
      {loading && <p role="status">Loading hadith records…</p>}
      {error && (
        <p className={styles.notice} role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}
      {inspected && (
        <section className={styles.context} aria-label="Hadith report context">
          <h3 ref={heading} tabIndex={-1}>
            {inspected.reference}
          </h3>
          <div className={styles.report} translate="no">
            <p>{inspected.text}</p>
          </div>
          <dl className={styles.metadata}>
            <dt>Collection / book</dt>
            <dd>
              {inspected.collectionName} /{" "}
              {inspected.bookName || inspected.bookNumber}
            </dd>
            <dt>Numbering</dt>
            <dd>
              {inspected.numberingScheme}: {inspected.hadithNumber}
              {inspected.otherReferences.map((item) => (
                <p key={`${item.scheme}:${item.value}`}>
                  {item.scheme}: {item.value}
                </p>
              ))}
            </dd>
            <dt>Narrator</dt>
            <dd>
              {inspected.narrator ||
                "Not separately supplied; consult the complete report above."}
            </dd>
            <dt>Chapter</dt>
            <dd>{inspected.chapterTitle || "Not supplied"}</dd>
            <dt>Supplied grade</dt>
            <dd>
              {inspected.grades.length
                ? inspected.grades.map((grade, index) => (
                    <p key={index}>
                      {grade.grade} · Authority:{" "}
                      {grade.authority || "Not supplied"}
                    </p>
                  ))
                : "Unknown / not supplied. No grade is inferred."}
            </dd>
            <dt>Source</dt>
            <dd>
              <a
                href={inspected.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-link"
              >
                Canonical report
              </a>
            </dd>
            <dt>Review</dt>
            <dd>
              {inspected.reviewState === "reviewed"
                ? `${inspected.reviewedBy} · ${inspected.reviewedAt?.slice(0, 10)} · ${inspected.reviewNotes}`
                : "Creator context review pending"}
            </dd>
          </dl>
          {inspected.context.map((item, index) => (
            <article className={styles.report} key={index} translate="no">
              <h4>{item.reference}</h4>
              <p>{item.text}</p>
            </article>
          ))}
          {inspected.arabic && (
            <details>
              <summary>Arabic retained for verification</summary>
              <p lang="ar" dir="rtl">
                {inspected.arabic}
              </p>
            </details>
          )}
          {inspected.reviewState !== "reviewed" && (
            <form
              className={styles.review}
              onSubmit={(event) => {
                event.preventDefault();
                void review();
              }}
            >
              <p>
                Review the full report, source reference, context and supplied
                grading before using it in a script.
              </p>
              <label>
                Reviewer
                <input
                  value={reviewer}
                  maxLength={200}
                  required
                  onChange={(event) => setReviewer(event.target.value)}
                />
              </label>
              <label>
                Context review notes
                <textarea
                  value={reviewNotes}
                  maxLength={2000}
                  required
                  onChange={(event) => setReviewNotes(event.target.value)}
                />
              </label>
              <button className="button" type="submit" disabled={busy}>
                I reviewed this complete report
              </button>
            </form>
          )}
          <div className={styles.actions}>
            {selection && (
              <button
                className="button primary-action"
                type="button"
                disabled={
                  busy ||
                  !selection.canInsert ||
                  inspected.reviewState !== "reviewed"
                }
                onClick={adopt}
              >
                {selection.replacement
                  ? "Replace quotation with full hadith"
                  : "Insert full hadith"}
              </button>
            )}
            <button
              className="text-link"
              type="button"
              disabled={busy}
              onClick={() => setInspected(null)}
            >
              Close report
            </button>
          </div>
        </section>
      )}
      {results && (
        <p role="status">
          {results.total} matching reports · Missing corpus coverage does not
          establish relevance.
        </p>
      )}
      {results?.rows.map((record) => (
        <article key={record.id} className={styles.report}>
          <h3>{record.reference}</h3>
          <p>
            {record.bookName || `Book ${record.bookNumber}`} ·{" "}
            {record.numberingScheme} · {record.reviewState}
          </p>
          <p>
            {record.grades.length
              ? record.grades
                  .map(
                    (grade) =>
                      `${grade.grade} (${grade.authority || "authority not supplied"})`,
                  )
                  .join("; ")
              : "Grade unknown / not supplied"}
          </p>
          <button
            type="button"
            className="text-link"
            disabled={busy}
            onClick={() => {
              setInspected(record);
              setNotice("");
            }}
          >
            Inspect complete report and context
          </button>
        </article>
      ))}
      {results && results.total > 20 && (
        <nav className={styles.actions} aria-label="Hadith results pages">
          <button
            className="button"
            type="button"
            disabled={query.page <= 1 || busy}
            onClick={() => search({ ...query, page: query.page - 1 })}
          >
            Previous
          </button>
          <span>
            Page {query.page} of {Math.ceil(results.total / 20)}
          </span>
          <button
            className="button"
            type="button"
            disabled={
              query.page * 20 >= results.total || query.page >= 400 || busy
            }
            onClick={() => search({ ...query, page: query.page + 1 })}
          >
            Next
          </button>
        </nav>
      )}
      {!selection && (
        <form
          className={styles.import}
          onSubmit={(event) => void importManual(event)}
        >
          <h3>Import reviewed manual records</h3>
          <p>
            Supply complete English reports with collection/book/numbering,
            canonical URL, narrator or explicit null, supplied grades and
            authorities or an empty list, translator or null, review evidence,
            coverage and rights notes. Importing does not infer a grade or
            permission.
          </p>
          <button
            type="button"
            className="text-link"
            disabled={busy || Boolean(manualJson)}
            onClick={() =>
              setManualJson(
                JSON.stringify(createManualHadithImportTemplate(), null, 2),
              )
            }
          >
            Use a blank import template
          </button>
          <label>
            Reviewed JSON file
            <input
              type="file"
              accept="application/json,.json"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (file.size > 4000000) {
                  setError("Use a reviewed import smaller than 4 MB.");
                  return;
                }
                void file.text().then(setManualJson);
              }}
            />
          </label>
          <label>
            Reviewed import JSON
            <textarea
              value={manualJson}
              maxLength={4000000}
              rows={8}
              disabled={busy}
              onChange={(event) => setManualJson(event.target.value)}
              placeholder={
                '{"edition":"…","translator":null,"provenance":"…","coverageNotes":"…","rightsStatus":"not_cleared","rightsNotes":"…","reviewedBy":"…","reviewedAt":"2026-10-08T00:00:00Z","records":[]}'
              }
            />
          </label>
          <button
            className="button"
            type="submit"
            disabled={busy || !manualJson.trim()}
          >
            {busy ? "Saving…" : "Import reviewed records"}
          </button>
          <p>
            Provider import:{" "}
            <code>
              pnpm exec tsx --conditions=react-server scripts/import-hadith.ts
              --sunnah collection:number
            </code>
            . API imports preserve unknown metadata and require context review
            here before insertion.
          </p>
        </form>
      )}
    </section>
  );
}
