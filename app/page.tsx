import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Feather,
  Leaf,
  Plus,
  Sparkles,
} from "lucide-react";
import { listEpisodes } from "@/lib/server/db/episodes";
import { getProviderSetup } from "@/lib/server/providers/setup";
import { EpisodeLibrary } from "@/components/episode-library";
import type { Episode } from "@/lib/domain/episode";

export const dynamic = "force-dynamic";

const prompts = [
  {
    theme: "patience",
    title: "When waiting feels heavy",
    copy: "A reminder for the person learning to trust the timing.",
    label: "SABR & PERSEVERANCE",
  },
  {
    theme: "hope",
    title: "You can begin again",
    copy: "A gentle place to start when the next step feels far away.",
    label: "HOPE & REASSURANCE",
  },
  {
    theme: "gratitude",
    title: "Notice the small mercies",
    copy: "An invitation to find goodness in the ordinary.",
    label: "GRATITUDE",
  },
];

export default async function Home() {
  let episodes: Episode[] = [];
  let unavailable = false;
  try {
    episodes = await listEpisodes();
  } catch {
    unavailable = true;
  }
  const configured = getProviderSetup().filter(
    (provider) => provider.configured,
  ).length;
  return (
    <>
      <div className="page-topline">
        <span className="eyebrow">YOUR SPACE TO CREATE WITH PURPOSE</span>
        <span className="local-label">
          <span className="status-dot" /> Local workspace
        </span>
      </div>
      <header className="page-heading">
        <div>
          <div className="eyebrow">THE STUDIO</div>
          <h1>
            Small reminders.
            <br />
            <em>Meaningful steps.</em>
          </h1>
          <p>
            A calm space to turn sincere intentions into something that helps.
          </p>
        </div>
        <Link href="/episodes/new" className="button primary-action">
          <Plus size={17} /> New episode
        </Link>
      </header>
      {!unavailable && episodes.length === 0 && (
        <section className="welcome-banner">
          <div className="welcome-copy">
            <span className="welcome-tag">
              <Leaf size={14} /> BEGIN WITH INTENTION
            </span>
            <h2>
              Somewhere, someone
              <br />
              needs a little hope.
            </h2>
            <p>
              Your next reminder could meet them there.
              <br />
              Start with an idea. We’ll take it one step at a time.
            </p>
            <Link href="/episodes/new" className="welcome-link">
              Create your first episode <ArrowUpRight size={18} />
            </Link>
          </div>
          <div className="welcome-art" aria-hidden="true">
            <div className="arch arch-back" />
            <div className="arch arch-front">
              <span className="sun" />
              <div className="hill hill-back" />
              <div className="hill hill-front" />
            </div>
            <div className="art-caption">
              a little patience.
              <br />
              <i>a little light.</i>
            </div>
            <span className="art-star">✧</span>
          </div>
        </section>
      )}
      <section className="episodes-section">
        <div className="section-heading">
          <div>
            <h2>
              Your episodes{" "}
              <span className="small-count">
                {unavailable ? "—" : String(episodes.length).padStart(2, "0")}
              </span>
            </h2>
            <p>
              {episodes.length
                ? "A collection of intentions, taking shape."
                : "Every reminder starts with a single thought."}
            </p>
          </div>
          <span className="eyebrow">ENGLISH · ISLAMIC REMINDERS</span>
        </div>
        {unavailable ? (
          <div className="empty-state panel" role="alert">
            <Feather size={25} />
            <h3>Your local database is offline.</h3>
            <p>
              Start the project database and refresh to see saved episodes.
              <br />
              You can still open a new brief; saving will be available when it
              reconnects.
            </p>
            <Link className="text-link" href="/">
              Try again <ArrowRight size={15} />
            </Link>
          </div>
        ) : episodes.length ? (
          <EpisodeLibrary episodes={episodes} />
        ) : (
          <div className="empty-state">
            <span className="empty-icon">
              <Feather size={23} strokeWidth={1.3} />
            </span>
            <h3>A blank page is a beautiful start.</h3>
            <p>Your ideas and works in progress will find a home here.</p>
            <Link className="text-link" href="/episodes/new">
              Start an episode <Plus size={15} />
            </Link>
          </div>
        )}
      </section>
      <section className="inspiration-section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">A SPARK, IF YOU NEED ONE</div>
            <h2>Where would you like to begin?</h2>
          </div>
          <Sparkles size={20} strokeWidth={1.2} />
        </div>
        <div className="prompt-grid">
          {prompts.map((prompt, index) => (
            <Link
              key={prompt.theme}
              href={`/episodes/new?theme=${prompt.theme}&title=${encodeURIComponent(prompt.title)}`}
              className={`prompt-card prompt-${index}`}
            >
              <div>
                <span className="eyebrow">{prompt.label}</span>
                <ArrowUpRight size={17} />
              </div>
              <h3>{prompt.title}</h3>
              <p>{prompt.copy}</p>
            </Link>
          ))}
        </div>
      </section>
      <Link href="/providers" className="provider-strip">
        <span className="provider-mini-icons">
          <span>C</span>
          <span>II</span>
          <span>D</span>
        </span>
        <div>
          <strong>Your creative toolkit</strong>
          <span>
            {configured} service keys added · credit-aware speech preferences
          </span>
        </div>
        <span className="text-link">
          View providers <ArrowRight size={16} />
        </span>
      </Link>
    </>
  );
}
