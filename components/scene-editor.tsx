"use client";
import { useState } from "react";
import type { Cue } from "@/lib/domain/media";
import type {
  EditorSettings,
  VisualSettings,
} from "@/lib/domain/scene-settings";
import type { MediaState } from "@/lib/server/media/state";

type Props = {
  settings: EditorSettings;
  onChange: (settings: EditorSettings) => void;
  cues: Cue[];
  assets: MediaState["assets"];
  mode: "text" | "narrated";
  section: string | null;
  vertical: boolean;
  busy: boolean;
  onSeek: (seconds: number) => void;
};
export function SceneEditor({
  settings,
  onChange,
  cues,
  assets,
  mode,
  section,
  vertical,
  busy,
  onSeek,
}: Props) {
  const [selected, setSelected] = useState(0);
  const [sceneOnly, setSceneOnly] = useState(false);
  const index = Math.min(selected, Math.max(0, cues.length - 1));
  const scene = settings.sceneOverrides.find((s) => s.cueIndex === index);
  const visual = sceneOnly && scene?.visual ? scene.visual : settings.visual;
  const orientation = vertical ? "vertical" : "landscape";
  const framing =
    sceneOnly && scene?.framing ? scene.framing : settings.framing;
  const update = (patch: Partial<EditorSettings>) =>
    onChange({ ...settings, ...patch });
  function updateScene(
    patch: Partial<EditorSettings["sceneOverrides"][number]>,
  ) {
    const next = { ...scene, cueIndex: index, ...patch };
    update({
      sceneOverrides: [
        ...settings.sceneOverrides.filter((s) => s.cueIndex !== index),
        next,
      ].sort((a, b) => a.cueIndex - b.cueIndex),
    });
  }
  function setVisual(patch: Partial<VisualSettings>) {
    if (sceneOnly) updateScene({ visual: { ...visual, ...patch } });
    else update({ visual: { ...settings.visual, ...patch } });
  }
  const showTimeline = ["video", "background", "voice"].includes(section || "");
  return (
    <fieldset className="scene-editor" disabled={busy}>
      {showTimeline && (
        <>
          <legend>Scenes & timing</legend>
          <p className="muted">
            Select a scene to inspect its words and seek the preview. Spoken
            scenes follow caption timing; reading cards have editable durations.
          </p>
          <div className="scene-timeline" aria-label="Scene timeline">
            {cues.map((cue, i) => (
              <button
                key={i}
                type="button"
                aria-pressed={index === i}
                onClick={() => {
                  setSelected(i);
                  onSeek(cue.start);
                }}
              >
                <strong>
                  Scene {i + 1}
                  {cue.blockIndex !== undefined
                    ? ` · block ${cue.blockIndex + 1}`
                    : ""}
                </strong>
                <small>
                  {cue.start.toFixed(1)}–{cue.end.toFixed(1)}s ·{" "}
                  {cue.kind === "quote" ? "Quotation" : "Reflection"}
                </small>
                <span>{cue.text}</span>
              </button>
            ))}
          </div>
          {cues[index] && mode === "text" && (
            <label>
              Scene {index + 1} reading duration (seconds)
              <input
                type="number"
                min="0.5"
                max="30"
                step="0.1"
                value={
                  settings.cardDurations[index] ??
                  Number((cues[index].end - cues[index].start).toFixed(2))
                }
                onChange={(e) =>
                  update({
                    cardDurations: cues.map((c, i) =>
                      i === index
                        ? Math.min(30, Math.max(0.5, Number(e.target.value)))
                        : (settings.cardDurations[i] ?? c.end - c.start),
                    ),
                  })
                }
              />
            </label>
          )}
          {settings.cardDurations.length > 0 && (
            <button
              type="button"
              className="text-link"
              onClick={() => update({ cardDurations: [] })}
            >
              Reset reading durations to reading speed
            </button>
          )}
        </>
      )}
      {["video", "background"].includes(section || "") && (
        <>
          <label className="check-label">
            <input
              type="checkbox"
              checked={sceneOnly}
              disabled={!cues.length}
              onChange={(e) => setSceneOnly(e.target.checked)}
            />
            Apply these visual controls to scene {index + 1} only
          </label>
          {sceneOnly && (
            <>
              <label>
                Scene background
                <select
                  value={
                    scene?.imageId === undefined
                      ? "inherit"
                      : scene.imageId || "color"
                  }
                  onChange={(e) =>
                    updateScene({
                      imageId:
                        e.target.value === "inherit"
                          ? undefined
                          : e.target.value === "color"
                            ? null
                            : e.target.value,
                    })
                  }
                >
                  <option value="inherit">Whole-video background</option>
                  <option value="color">Color background</option>
                  {assets
                    .filter((a) => a.kind === "image")
                    .map((a) => (
                      <option value={a.id} key={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Scene darkness
                <input
                  type="range"
                  min="0.2"
                  max="0.85"
                  step="0.05"
                  value={scene?.imageDim ?? 0.45}
                  onChange={(e) =>
                    updateScene({ imageDim: Number(e.target.value) })
                  }
                />
              </label>
              <button
                type="button"
                className="text-link"
                onClick={() =>
                  update({
                    sceneOverrides: settings.sceneOverrides.filter(
                      (s) => s.cueIndex !== index,
                    ),
                  })
                }
              >
                Reset scene {index + 1} overrides
              </button>
            </>
          )}
          <h3>{vertical ? "Vertical" : "Landscape"} framing</h3>
          {(["x", "y", "zoom"] as const).map((key) => (
            <label key={key}>
              {key === "x"
                ? "Horizontal crop"
                : key === "y"
                  ? "Vertical crop"
                  : "Image zoom"}
              <input
                aria-label={`${orientation} ${key}`}
                type="range"
                min={key === "zoom" ? 1 : 0}
                max={key === "zoom" ? 2 : 100}
                step={key === "zoom" ? 0.05 : 1}
                value={framing[orientation][key]}
                onChange={(e) => {
                  const next = {
                    ...framing,
                    [orientation]: {
                      ...framing[orientation],
                      [key]: Number(e.target.value),
                    },
                  };
                  if (sceneOnly) updateScene({ framing: next });
                  else update({ framing: next });
                }}
              />
            </label>
          ))}
          <h3>Text styling</h3>
          <label>
            Font
            <select
              value={visual.font}
              onChange={(e) =>
                setVisual({ font: e.target.value as VisualSettings["font"] })
              }
            >
              <option value="serif">Serif</option>
              <option value="sans">Sans serif</option>
            </select>
          </label>
          <label>
            Text size
            <input
              aria-label="Text size"
              type="range"
              min="0.65"
              max="1.15"
              step="0.05"
              value={visual.textScale}
              onChange={(e) => setVisual({ textScale: Number(e.target.value) })}
            />
          </label>
          <label>
            Line spacing
            <input
              aria-label="Line spacing"
              type="range"
              min="1.1"
              max="1.7"
              step="0.05"
              value={visual.lineHeight}
              onChange={(e) =>
                setVisual({ lineHeight: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Placement
            <select
              value={visual.placement}
              onChange={(e) =>
                setVisual({
                  placement: e.target.value as VisualSettings["placement"],
                })
              }
            >
              <option value="upper">Upper</option>
              <option value="center">Center</option>
              <option value="lower">Lower</option>
            </select>
          </label>
          <label>
            Alignment
            <select
              value={visual.alignment}
              onChange={(e) =>
                setVisual({
                  alignment: e.target.value as VisualSettings["alignment"],
                })
              }
            >
              <option value="center">Centered</option>
              <option value="left">Left</option>
            </select>
          </label>
          <div className="scene-colors">
            <label>
              Text color
              <input
                type="color"
                value={visual.textColor}
                onChange={(e) => setVisual({ textColor: e.target.value })}
              />
            </label>
            <label>
              Accent color
              <input
                type="color"
                value={visual.accentColor}
                onChange={(e) => setVisual({ accentColor: e.target.value })}
              />
            </label>
          </div>
          <label>
            Transition
            <select
              value={visual.transition}
              onChange={(e) =>
                setVisual({
                  transition: e.target.value as VisualSettings["transition"],
                })
              }
            >
              <option value="fade">Gentle fade</option>
              <option value="cut">Cut</option>
            </select>
          </label>
          {!sceneOnly && (
            <>
              <label>
                Opening card
                <input
                  maxLength={160}
                  value={settings.visual.openingText}
                  placeholder="Use script title"
                  onChange={(e) => setVisual({ openingText: e.target.value })}
                />
              </label>
              <label>
                Opening duration (seconds)
                <input
                  type="number"
                  min="0"
                  max="8"
                  step="0.1"
                  value={settings.openingSeconds}
                  onChange={(e) =>
                    update({
                      openingSeconds: Math.min(
                        8,
                        Math.max(0, Number(e.target.value)),
                      ),
                    })
                  }
                />
              </label>
              <label>
                Closing card
                <input
                  maxLength={160}
                  value={settings.visual.closingText}
                  onChange={(e) => setVisual({ closingText: e.target.value })}
                />
              </label>
              <label>
                Closing duration (seconds)
                <input
                  type="number"
                  min="0.1"
                  max="8"
                  step="0.1"
                  value={settings.closingSeconds}
                  onChange={(e) =>
                    update({
                      closingSeconds: Math.min(
                        8,
                        Math.max(0.1, Number(e.target.value)),
                      ),
                    })
                  }
                />
              </label>
              <label>
                Branding
                <input
                  maxLength={40}
                  value={settings.visual.branding}
                  onChange={(e) => setVisual({ branding: e.target.value })}
                />
              </label>
            </>
          )}
        </>
      )}
      {section === "music" && (
        <>
          <legend>Track trim & mix</legend>
          <label>
            Start offset (seconds)
            <input
              type="number"
              min="0"
              max="1200"
              step="0.1"
              value={settings.musicStart}
              onChange={(e) =>
                update({
                  musicStart: Math.min(
                    1200,
                    Math.max(0, Number(e.target.value)),
                  ),
                })
              }
            />
          </label>
          <label>
            End of selected range (seconds)
            <input
              type="number"
              min="0.1"
              max="1200"
              step="0.1"
              placeholder="End of track"
              value={settings.musicEnd ?? ""}
              onChange={(e) =>
                update({
                  musicEnd:
                    e.target.value === ""
                      ? null
                      : Math.min(1200, Math.max(0.1, Number(e.target.value))),
                })
              }
            />
          </label>
          <label>
            Fade in (seconds)
            <input
              type="number"
              min="0"
              max="10"
              step="0.5"
              value={settings.musicFadeIn}
              onChange={(e) =>
                update({
                  musicFadeIn: Math.min(
                    10,
                    Math.max(0, Number(e.target.value)),
                  ),
                })
              }
            />
          </label>
          <label>
            Fade out (seconds)
            <input
              type="number"
              min="0"
              max="10"
              step="0.5"
              value={settings.musicFadeOut}
              onChange={(e) =>
                update({
                  musicFadeOut: Math.min(
                    10,
                    Math.max(0, Number(e.target.value)),
                  ),
                })
              }
            />
          </label>
          <label>
            Music level during narration ·{" "}
            {Math.round(settings.musicDuck * 100)}%
            <input
              aria-label="Music ducking"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.musicDuck}
              onChange={(e) => update({ musicDuck: Number(e.target.value) })}
            />
          </label>
          <p className="muted">
            The selected range loops when looping is enabled. Ducking lowers
            music around spoken captions.
          </p>
        </>
      )}
    </fieldset>
  );
}
