import Link from "next/link";
import { BookOpen, ArrowUpRight } from "lucide-react";
import { listSourceImports, browseSources } from "@/lib/server/db/sources";
import { parseReference } from "@/lib/domain/source";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Sources",
  other: { google: "notranslate" },
};
type Params = Record<string, string | string[] | undefined>;
const value = (p: Params, key: string) =>
  typeof p[key] === "string" ? (p[key] as string) : "";

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  let imports: Awaited<ReturnType<typeof listSourceImports>>;
  try {
    imports = await listSourceImports();
  } catch {
    return (
      <section className="empty-state panel" role="alert">
        <BookOpen />
        <h1>Sources are unavailable.</h1>
        <p>Start the local database and refresh to inspect saved sources.</p>
        <Link href="/sources" className="text-link">
          Try again
        </Link>
      </section>
    );
  }
  const selected =
    imports.find((i) => i.id === value(params, "edition")) ||
    imports.find((i) => i.status === "completed") ||
    imports[0];
  const reference = value(params, "reference").trim();
  const chapter = Number(value(params, "chapter"));
  const page = Math.min(
    400,
    Math.max(1, Math.floor(Number(value(params, "page")) || 1)),
  );
  const q = value(params, "q").trim().slice(0, 200);
  const invalidReference = Boolean(reference && !parseReference(reference));
  let data: Awaited<ReturnType<typeof browseSources>> | undefined;
  let unavailable = false;
  if (selected) {
    try {
      data = await browseSources(selected.id, {
        reference: invalidReference ? undefined : reference,
        chapter:
          Number.isInteger(chapter) && chapter >= 1 && chapter <= 114
            ? chapter
            : undefined,
        q,
        page: Math.floor(page),
      });
    } catch {
      unavailable = true;
    }
  }
  const pageLink = (n: number) =>
    `/sources?${new URLSearchParams({ edition: selected.id, chapter: chapter ? String(chapter) : "", q, page: String(n) })}`;
  return (
    <>
      <div className="page-topline">
        <span className="eyebrow">BEGIN WITH THE SOURCE</span>
        <span className="local-label">Local source library</span>
      </div>
      <header className="page-heading">
        <div>
          <div className="eyebrow">QUR’AN TRANSLATIONS</div>
          <h1>
            Read carefully.
            <br />
            <em>Keep the context.</em>
          </h1>
          <p>
            Inspect the translation, its reference, and the surrounding passage.
          </p>
        </div>
        <div className="header-symbol">
          <BookOpen size={32} strokeWidth={1.1} />
        </div>
      </header>
      {!selected ? (
        <section className="empty-state panel">
          <BookOpen />
          <h2>Your source library is ready to begin.</h2>
          <p>
            No translation has been imported. List available editions with{" "}
            <code>pnpm sources:list</code>, then run{" "}
            <code>pnpm sources:import 85</code> for the documented pre-live
            inspection edition.
          </p>
        </section>
      ) : (
        <>
          <section
            className="source-provenance panel"
            aria-label="Edition provenance"
          >
            <div className="section-heading">
              <div>
                <span className="eyebrow">
                  SELECTED EDITION · ENGLISH TRANSLATION
                </span>
                <h2>{selected.name}</h2>
                <p>
                  Translator as supplied: {selected.author} · Quran Foundation
                  resource {selected.resourceId}
                </p>
              </div>
              <span className="pill waiting">
                {selected.rightsStatus === "cleared"
                  ? "Reuse cleared"
                  : "Publication reuse not cleared"}
              </span>
            </div>
            <p>
              <strong>
                {selected.completedChapters.length} of{" "}
                {selected.expectedChapters} available chapters imported
              </strong>{" "}
              · {selected.expectedVerses} verses expected in this catalog ·{" "}
              {selected.environment === "prelive" ? "Pre-live" : "Production"}{" "}
              environment
            </p>
            {selected.expectedChapters < 114 && (
              <p className="source-notice">
                Partial Qur’an coverage: this catalog exposes{" "}
                {selected.expectedChapters} of 114 chapters. Missing chapters
                are unavailable here.
              </p>
            )}
            <p>
              Import:{" "}
              {selected.status === "completed"
                ? "available catalog complete"
                : selected.status === "failed"
                  ? "failed — saved chapters retained"
                  : "incomplete — import running or interrupted"}
              . Last checkpoint:{" "}
              {selected.updatedAt.toISOString().replace("T", " ").slice(0, 19)}{" "}
              UTC.
            </p>
            {selected.status !== "completed" && (
              <p role="status">
                {selected.errorCode ? `${selected.errorCode}. ` : ""}Resume with{" "}
                <code>pnpm sources:import {selected.resourceId}</code>.
              </p>
            )}
            <details>
              <summary>Attribution, reuse review, and source version</summary>
              <p>{selected.rightsNotes}</p>
              <p>
                Import ID: <code>{selected.id}</code>
              </p>
              <p className="source-hash">
                SHA-256:{" "}
                <code>{selected.checksum || "Available after completion"}</code>
              </p>
              <p>
                Source wording and Arabic are retained with the provider
                payload. Formatting is normalized for reading; footnote markers
                remain visible. This is source inspection, not an approved
                script or interpretation.
              </p>
              <a
                className="text-link"
                href="https://quran.zendesk.com/hc/en-us/articles/115003652132-Using-content-from-Quran-com"
                target="_blank"
                rel="noreferrer"
              >
                Quran.com reuse guidance <ArrowUpRight size={14} />
              </a>
            </details>
          </section>
          <form className="source-filters panel" action="/sources">
            <label>
              Edition
              <select name="edition" defaultValue={selected.id}>
                {imports.map((i) => (
                  <option value={i.id} key={i.id}>
                    {i.name} · {i.environment} · {i.status} ·{" "}
                    {i.createdAt.toISOString().slice(0, 10)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Chapter
              <select name="chapter" defaultValue={chapter || ""}>
                <option value="">All imported chapters</option>
                {data?.chapters.map((c) => (
                  <option key={c.chapter} value={c.chapter}>
                    {c.chapter}. {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Words in translation
              <input
                name="q"
                defaultValue={q}
                placeholder="e.g. patience"
                maxLength={200}
              />
            </label>
            <label>
              Verse and context
              <input
                name="reference"
                defaultValue={reference}
                placeholder="e.g. 2:153"
                aria-describedby="reference-help"
              />
            </label>
            <button type="submit" className="button primary-action">
              Find sources
            </button>
            <Link href="/sources" className="text-link">
              Clear filters
            </Link>
            <p id="reference-help" className="source-filter-help">
              A verse reference opens up to two verses before and after it,
              overriding the chapter and word filters.
            </p>
          </form>
          {invalidReference ? (
            <p role="alert" className="source-notice">
              Enter a reference such as 2:153 (chapter:verse).
            </p>
          ) : unavailable ? (
            <p role="alert">Sources could not be loaded. Refresh to retry.</p>
          ) : (
            data && (
              <>
                <div className="section-heading">
                  <h2>
                    {reference
                      ? `Context for Qur’an ${reference}`
                      : `${data.total} matching verses`}
                  </h2>
                  <span className="eyebrow">
                    TRANSLATION · EXACT SOURCE WORDING
                  </span>
                </div>
                {!data.referenceFound || !data.rows.length ? (
                  <section className="empty-state panel">
                    <h3>No source found in this import.</h3>
                    <p>
                      Try a different reference or search. Missing coverage is
                      not evidence that the Qur’an has no relevant passage.
                    </p>
                  </section>
                ) : (
                  data.rows.map((p) => (
                    <article
                      className={`source-passage panel ${p.reference === reference ? "source-selected" : ""}`}
                      key={p.id}
                      translate="no"
                    >
                      <div className="source-passage-heading">
                        <h3>
                          Qur’an {p.reference} <span>· {p.chapterName}</span>
                        </h3>
                        <a
                          href={`https://quran.com/${p.chapter}/${p.verse}?translations=${selected.resourceId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-link"
                        >
                          Canonical source <ArrowUpRight size={14} />
                        </a>
                      </div>
                      <p className="source-translation">{p.text}</p>
                      <div className="source-passage-foot">
                        <span>{selected.name} · English translation</span>
                        <Link
                          href={`/sources?edition=${selected.id}&reference=${p.reference}`}
                          className="text-link"
                        >
                          Read surrounding verses
                        </Link>
                      </div>
                      <details>
                        <summary>Arabic and provenance</summary>
                        <p lang="ar" dir="rtl" className="source-arabic">
                          {p.arabic}
                        </p>
                        <p>
                          Canonical record: <code>{p.id}</code>
                        </p>
                        <p className="source-hash">
                          Payload SHA-256: <code>{p.checksum}</code>
                        </p>
                      </details>
                    </article>
                  ))
                )}
                {!reference && data.total > 20 && (
                  <nav
                    className="source-pagination"
                    aria-label="Source results pages"
                  >
                    {page > 1 && (
                      <Link className="button" href={pageLink(page - 1)}>
                        Previous
                      </Link>
                    )}
                    <span>
                      Page {page} of {Math.ceil(data.total / 20)}
                    </span>
                    {page * 20 < data.total && (
                      <Link className="button" href={pageLink(page + 1)}>
                        Next
                      </Link>
                    )}
                  </nav>
                )}
              </>
            )
          )}
        </>
      )}
    </>
  );
}
