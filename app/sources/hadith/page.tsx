import Link from "next/link";
import { HadithLibrary } from "@/components/hadith-source-browser";
export const metadata = {
  title: "Hadith sources",
  other: { google: "notranslate" },
};
export default function HadithPage() {
  return (
    <>
      <header className="page-heading">
        <div>
          <span className="eyebrow">SOURCES · HADITH</span>
          <h1>
            Keep the full report.
            <br />
            <em>Preserve its provenance.</em>
          </h1>
          <p>
            Inspect imported reports, numbering schemes, narrator, supplied
            grades and review evidence.
          </p>
          <Link href="/sources" className="text-link">
            Qur’an translations
          </Link>
        </div>
      </header>
      <HadithLibrary />
    </>
  );
}
