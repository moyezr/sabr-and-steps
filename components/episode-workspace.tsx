"use client";

import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  ArrowLeft,
  AudioLines,
  BookOpen,
  Check,
  Clapperboard,
  Download,
  Feather,
  ImageIcon,
  Music2,
} from "lucide-react";
import {
  WORKSPACE_SECTIONS,
  workspaceHref,
  type EpisodeWorkspaceState,
  type WorkspaceSection,
} from "@/lib/domain/workspace";

type DraftState = { dirty: boolean; saving: boolean };
const idleDraft: DraftState = { dirty: false, saving: false };
const WorkspaceContext = createContext<{
  setDraft: (draft: DraftState) => void;
  refreshWorkspace: () => Promise<void>;
  buffers: Map<string, unknown> | null;
  unsavedSections: Set<string> | null;
}>({
  setDraft: () => {},
  refreshWorkspace: async () => {},
  buffers: null,
  unsavedSections: null,
});

export function useEpisodeWorkspace() {
  return useContext(WorkspaceContext);
}

/** Keep drafts in this episode's mounted layout, including history navigation. */
export function useWorkspaceBuffer<T>(
  key: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>, () => void] {
  const { buffers } = useEpisodeWorkspace();
  const [value, setValue] = useState<T>(() =>
    buffers?.has(key) ? (buffers.get(key) as T) : initial,
  );
  const current = useRef(value);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const update = useCallback<Dispatch<SetStateAction<T>>>(
    (action) => {
      if (!mounted.current) return;
      const previous = current.current;
      const next =
        typeof action === "function"
          ? (action as (previous: T) => T)(previous)
          : action;
      current.current = next;
      // An old request may settle after another mounted editor has changed it.
      if (!buffers?.has(key) || buffers.get(key) === previous)
        buffers?.set(key, next);
      setValue(next);
    },
    [buffers, key],
  );
  const clear = useCallback(() => {
    if (!mounted.current) return;
    if (buffers?.get(key) === current.current) buffers.delete(key);
  }, [buffers, key]);
  return [value, update, clear];
}

/** Report the mounted editor's save state without moving its draft into the shell. */
export function useWorkspaceDraft({ dirty, saving }: DraftState) {
  const { setDraft, unsavedSections } = useEpisodeWorkspace();
  const pathname = usePathname();
  useEffect(() => {
    if (dirty) unsavedSections?.add(pathname);
    else unsavedSections?.delete(pathname);
    setDraft({ dirty, saving });
    // Dirty sections stay registered while their editor is unmounted.
    return () => setDraft(idleDraft);
  }, [dirty, saving, setDraft, pathname, unsavedSections]);
}

const icons = {
  idea: Feather,
  script: BookOpen,
  voice: AudioLines,
  music: Music2,
  background: ImageIcon,
  video: Clapperboard,
  exports: Download,
};

export function EpisodeWorkspace({
  initial,
  children,
}: {
  initial: EpisodeWorkspaceState;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pendingLeave, setPendingLeave] = useState<string | null>(null);
  const leaveDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = leaveDialog.current;
    if (pendingLeave && !dialog?.open) dialog?.showModal();
    if (!pendingLeave && dialog?.open) dialog.close();
  }, [pendingLeave]);
  const pathname = usePathname();
  const params = useSearchParams();
  const query = params.toString();
  const [state, setState] = useState(initial);
  const [draft, setDraft] = useState(idleDraft);
  const [unavailable, setUnavailable] = useState(false);
  const [buffers] = useState(() => new Map<string, unknown>());
  const [unsavedSections] = useState(() => new Set<string>());
  const refreshWorkspace = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/episodes/${initial.episode.id}/workspace`,
      );
      if (!response.ok) throw new Error("Workspace status unavailable");
      const next: EpisodeWorkspaceState = await response.json();
      setState(next);
      setUnavailable(false);
    } catch {
      // Keep both the last known status and the mounted editor's unsaved work.
      setUnavailable(true);
    }
  }, [initial.episode.id]);

  useEffect(() => {
    const initialRefresh = setTimeout(() => void refreshWorkspace(), 0);
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void refreshWorkspace();
    }, 8000);
    return () => {
      clearTimeout(initialRefresh);
      clearInterval(interval);
    };
  }, [pathname, query, refreshWorkspace]);

  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!draft.dirty && unsavedSections.size === 0) return;
      event.preventDefault();
      event.returnValue = "";
    }
    function protectDraft(event: MouseEvent) {
      if (!draft.dirty && unsavedSections.size === 0) return;
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link =
        event.target instanceof Element ? event.target.closest("a") : null;
      if (!link || link.target === "_blank" || link.hasAttribute("download"))
        return;
      const destination = new URL(link.href, window.location.href);
      // All episode sections retain drafts in the mounted workspace layout.
      if (
        destination.origin !== window.location.origin ||
        destination.pathname.startsWith(`/episodes/${initial.episode.id}/`) ||
        destination.pathname === window.location.pathname ||
        destination.pathname.startsWith("/api/")
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      setPendingLeave(
        destination.pathname + destination.search + destination.hash,
      );
    }
    // Supported browsers can also cancel history traversal out of this episode.
    // Traversal between its sections is safe because those drafts stay buffered.
    const navigation = (window as Window & { navigation?: EventTarget })
      .navigation;
    function protectTraversal(event: Event) {
      const change = event as Event & {
        navigationType?: string;
        destination?: { url: string };
      };
      if (
        change.navigationType !== "traverse" ||
        !change.cancelable ||
        !change.destination ||
        (!draft.dirty && unsavedSections.size === 0)
      )
        return;
      const destination = new URL(change.destination.url);
      if (
        destination.origin === window.location.origin &&
        destination.pathname.startsWith(`/episodes/${initial.episode.id}/`)
      )
        return;
      if (destination.origin !== window.location.origin) return;
      event.preventDefault();
      setPendingLeave(
        destination.pathname + destination.search + destination.hash,
      );
    }
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", protectDraft, true);
    navigation?.addEventListener("navigate", protectTraversal);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", protectDraft, true);
      navigation?.removeEventListener("navigate", protectTraversal);
    };
  }, [draft.dirty, initial.episode.id, unsavedSections]);

  const context = useMemo(
    () => ({ setDraft, refreshWorkspace, buffers, unsavedSections }),
    [refreshWorkspace, buffers, unsavedSections],
  );
  const requested = params.get("section");
  const section: WorkspaceSection = pathname.endsWith("/brief")
    ? "idea"
    : pathname.endsWith("/script")
      ? "script"
      : WORKSPACE_SECTIONS.some(
            (item) =>
              item.id === requested &&
              item.id !== "idea" &&
              item.id !== "script",
          )
        ? (requested as WorkspaceSection)
        : "video";

  return (
    <WorkspaceContext.Provider value={context}>
      <dialog
        ref={leaveDialog}
        className="workspace-leave-dialog"
        aria-labelledby="leave-title"
        aria-describedby="leave-description"
        onCancel={(event) => {
          event.preventDefault();
          setPendingLeave(null);
        }}
      >
        <h2 id="leave-title">Leave this episode?</h2>
        <p id="leave-description">
          Your unsaved changes are kept while you move between this episode’s
          sections. Leaving now will discard them.
        </p>
        <div>
          <button type="button" onClick={() => setPendingLeave(null)}>
            Keep editing
          </button>
          <button
            type="button"
            className="workspace-export"
            onClick={() => {
              if (!pendingLeave) return;
              const href = pendingLeave;
              buffers.clear();
              unsavedSections.clear();
              setDraft(idleDraft);
              setPendingLeave(null);
              router.push(href);
            }}
          >
            Discard & leave
          </button>
        </div>
      </dialog>
      <div className="episode-workspace">
        <div className="workspace-topline">
          <Link href="/" className="back-link">
            <ArrowLeft size={15} /> All episodes
          </Link>
          <span className="eyebrow">EPISODE EDITOR</span>
        </div>
        <header className="workspace-header">
          <div className="workspace-title">
            <h1>{state.episode.title}</h1>
            <p>
              Shape the words, picture, and sound. Move between sections at any
              time.
            </p>
          </div>
          <div className="workspace-actions">
            <span
              className={`workspace-save-state ${draft.dirty ? "is-dirty" : ""}`}
              role="status"
            >
              {draft.saving ? (
                "Working…"
              ) : draft.dirty ? (
                "Unsaved changes"
              ) : unsavedSections.size > 0 ? (
                "Edits kept in this workspace"
              ) : (
                <>
                  <Check size={14} /> Saved
                </>
              )}
            </span>
            <Link
              href={workspaceHref(state.episode.id, "exports")}
              className="workspace-export"
            >
              <Download size={16} /> Exports
              {state.exportCount > 0 && <span>{state.exportCount}</span>}
            </Link>
          </div>
        </header>
        {unavailable && (
          <p className="source-notice" role="status">
            Status is temporarily unavailable. Your open edits are still here.{" "}
            <button
              type="button"
              className="text-link"
              onClick={() => void refreshWorkspace()}
            >
              Retry
            </button>
          </p>
        )}
        <nav className="workspace-navigation" aria-label="Episode sections">
          {WORKSPACE_SECTIONS.map(({ id, label }) => {
            const Icon = icons[id];
            const stage = state.stages[id];
            return (
              <Link
                key={id}
                href={workspaceHref(state.episode.id, id)}
                aria-current={section === id ? "page" : undefined}
              >
                <span className="workspace-nav-label">
                  <Icon size={17} />
                  {label}
                </span>
                <span className={`workspace-stage ${stage.tone}`}>
                  {stage.label}
                </span>
              </Link>
            );
          })}
        </nav>
        <div className="workspace-content">{children}</div>
      </div>
    </WorkspaceContext.Provider>
  );
}
