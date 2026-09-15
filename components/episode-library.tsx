"use client";

import { useState } from "react";
import Link from "next/link";
import { Input, TextField } from "@heroui/react";
import {
  ArrowUpRight,
  Clock3,
  Leaf,
  Monitor,
  Search,
  Smartphone,
} from "lucide-react";
import { durationLabel, type Episode } from "@/lib/domain/episode";

export function EpisodeLibrary({ episodes }: { episodes: Episode[] }) {
  const [query, setQuery] = useState("");
  const filtered = episodes.filter((episode) =>
    `${episode.title} ${episode.brief}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  return (
    <>
      <div className="library-tools">
        <div className="library-filter">
          All episodes <span>{episodes.length}</span>
        </div>
        <div className="episode-search">
          <Search size={16} />
          <TextField
            aria-label="Search episodes"
            value={query}
            onChange={setQuery}
          >
            <Input placeholder="Find a reminder…" />
          </TextField>
        </div>
      </div>
      <div className="episode-list">
        {filtered.map((episode) => (
          <Link
            key={episode.id}
            href={`/episodes/${episode.id}`}
            className="episode-row"
          >
            <div className={`episode-art theme-${episode.theme}`}>
              <span className="art-ring" />
              <Leaf size={21} strokeWidth={1} />
            </div>
            <div className="episode-info">
              <span className="eyebrow">{episode.theme}</span>
              <h3>{episode.title}</h3>
              <div className="episode-meta">
                <span>
                  <Clock3 size={13} />
                  {durationLabel(episode.targetSeconds)}
                </span>
                <span>
                  {episode.format !== "vertical" && <Monitor size={13} />}
                  {episode.format !== "landscape" && <Smartphone size={13} />}
                  {episode.format === "both" ? "Two formats" : episode.format}
                </span>
              </div>
            </div>
            <span className="pill">Idea</span>
            <span className="episode-date">
              {new Date(episode.updatedAt).toLocaleDateString("en-GB", {
                month: "short",
                day: "numeric",
                timeZone: "UTC",
              })}
            </span>
            <ArrowUpRight className="row-arrow" size={19} />
          </Link>
        ))}
      </div>
      {filtered.length === 0 && (
        <div className="search-empty">
          <p>No reminders match “{query}”.</p>
          <button type="button" onClick={() => setQuery("")}>
            Clear search
          </button>
        </div>
      )}
    </>
  );
}
