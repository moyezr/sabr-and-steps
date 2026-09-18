"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  AudioLines,
  BookOpen,
  Feather,
  Layers3,
  Leaf,
} from "lucide-react";

export function StudioNav() {
  const pathname = usePathname();
  return (
    <aside className="studio-sidebar">
      <Link className="brand" href="/" aria-label="Sabr and Steps home">
        <span className="brand-mark">
          <Leaf size={25} strokeWidth={1.3} />
        </span>
        <span>
          Sabr <i>&</i> Steps<small>THE CREATOR STUDIO</small>
        </span>
      </Link>
      <div className="sidebar-section-label">WORKSPACE</div>
      <nav aria-label="Studio navigation" className="studio-navigation">
        <Link
          href="/"
          className={
            pathname === "/" || pathname.startsWith("/episodes") ? "active" : ""
          }
        >
          <Layers3 size={19} /> Episodes <span className="nav-dot" />
        </Link>
        <Link
          href="/sources"
          className={pathname.startsWith("/sources") ? "active" : ""}
        >
          <BookOpen size={19} /> Sources
        </Link>
        <Link
          href="/providers"
          className={pathname === "/providers" ? "active" : ""}
        >
          <AudioLines size={19} /> Providers
        </Link>
      </nav>
      <div className="sidebar-note">
        <Feather size={22} strokeWidth={1.3} />
        <p>
          A little patience.
          <br />A meaningful step.
        </p>
        <span>
          Make space for reminders
          <br />
          that meet people where they are.
        </span>
      </div>
      <div className="sidebar-bottom">
        <span className="status-dot" /> Local workspace{" "}
        <ArrowUpRight size={14} />
      </div>
    </aside>
  );
}
