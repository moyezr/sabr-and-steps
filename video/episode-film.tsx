import { Gif } from "@remotion/gif";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { mixGains, musicEnvelope } from "../lib/domain/media";
import {
  defaultEditorSettings,
  musicGainAt,
  fitSceneText,
} from "../lib/domain/scene-settings";
import type { CompositionData } from "../lib/domain/media";
export type FilmProps = { data: CompositionData; assetBaseUrl?: string };
const palettes = {
  forest: ["#102d28", "#335b46", "#bfa573"],
  dusk: ["#22283e", "#655567", "#c8a98a"],
  sand: ["#39382e", "#776d50", "#d6bd83"],
};
/** The Player and both exports use this exact component and immutable data. */
export function EpisodeFilm({ data, assetBaseUrl = "" }: FilmProps) {
  const frame = useCurrentFrame();
  const { width, height, fps, durationInFrames } = useVideoConfig();
  const vertical = height > width;
  const t = frame / fps;
  const cueIndex = data.cues.findIndex((c) => t >= c.start && t < c.end);
  const cue = data.cues[cueIndex];
  const settings = data.editorSettings;
  const scene = settings?.sceneOverrides.find((s) => s.cueIndex === cueIndex);
  const visual =
    scene?.visual || settings?.visual || defaultEditorSettings().visual;
  const framing =
    scene?.framing?.[vertical ? "vertical" : "landscape"] ||
    settings?.framing[vertical ? "vertical" : "landscape"];
  const sceneImage = data.sceneImages?.find((s) => s.cueIndex === cueIndex);
  const image = sceneImage ? sceneImage.image : data.image;
  const imagePosition = framing?.x ?? data.imagePosition ?? 50;
  const imageY = framing?.y ?? 50;
  const zoom = framing?.zoom ?? 1;
  const imageDim = scene?.imageDim ?? data.imageDim ?? 0.45;
  const first = data.cues[0];
  const last = data.cues[data.cues.length - 1];
  const opening = t < first.start;
  const closing = t >= last.end;
  const visibleText =
    cue?.text ??
    (opening
      ? visual.openingText || data.title
      : closing
        ? visual.closingText
        : "");
  const textPanelHeight =
    height * (settings ? (vertical ? 0.4 : 0.5) : vertical ? 0.32 : 0.4);
  const requestedTop =
    height *
    (visual.placement === "upper"
      ? 0.19
      : visual.placement === "lower"
        ? 0.44
        : vertical
          ? 0.34
          : 0.3);
  const textPanelTop = settings
    ? Math.min(requestedTop, height - (vertical ? 360 : 170) - textPanelHeight)
    : requestedTop;
  const availableWidth = width - (vertical ? 240 : 480);
  const attributionSize =
    settings &&
    (cue?.reference?.length || 0) + (cue?.edition?.length || 0) > 200
      ? 16
      : 25;
  const attributionColumns = Math.max(
    1,
    Math.floor(availableWidth / attributionSize),
  );
  const citationHeight =
    cue?.kind === "quote"
      ? (Math.ceil((cue.reference?.length || 0) / attributionColumns) +
          Math.ceil((cue.edition?.length || 0) / attributionColumns)) *
          attributionSize *
          1.5 +
        88
      : 0;
  const fittedSize = settings
    ? fitSceneText(
        visibleText,
        availableWidth,
        textPanelHeight - citationHeight,
        (vertical ? 74 : 84) * visual.textScale,
        visual.lineHeight,
      )
    : vertical
      ? 74
      : 84;
  const colors = palettes[data.background];
  const fade = interpolate(
    frame,
    [0, 15, durationInFrames - 20, durationInFrames - 1],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const textOpacity =
    cue && visual.transition === "fade"
      ? interpolate(t - cue.start, [0, 0.1], [0, 1], {
          extrapolateRight: "clamp",
          extrapolateLeft: "clamp",
        })
      : 1;
  const imageScale =
    image?.width && image.height
      ? Math.max(width / image.width, height / image.height)
      : 1;
  const gifWidth = (image?.width || width) * imageScale * zoom;
  const gifHeight = (image?.height || height) * imageScale * zoom;
  const gains = mixGains(
    data.audioUrl ? data.narrationVolume : 0,
    data.music ? (data.musicVolume ?? 0.2) : 0,
  );
  return (
    <AbsoluteFill
      style={{
        background: colors[0],
        color: visual.textColor,
        fontFamily:
          visual.font === "sans" ? "Arial, sans-serif" : "Georgia, serif",
        overflow: "hidden",
      }}
    >
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at ${65 + Math.sin(t / 15) * 3}% 15%, ${colors[1]} 0%, transparent 65%),linear-gradient(155deg,${colors[0]},${colors[1]})`,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: width * 0.8,
          height: width * 0.8,
          borderRadius: "50%",
          top: -width * 0.43,
          right: -width * 0.12,
          background: colors[2],
          opacity: 0.1,
          transform: `translateY(${Math.sin(t / 18) * 12}px)`,
        }}
      />
      <svg
        viewBox="0 0 1920 1080"
        preserveAspectRatio="none"
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          opacity: 0.16,
        }}
        aria-hidden="true"
      >
        <path
          d="M-100 1020 Q 470 480 1060 940 T 2050 580 L2050 1180 L-100 1180Z"
          fill={colors[2]}
        />
        <path
          d="M-100 1060 Q 650 690 1300 1010 T 2050 780 L2050 1180 L-100 1180Z"
          fill={colors[0]}
        />
      </svg>
      {image && (
        <>
          {image.mime === "image/gif" ? (
            <Gif
              src={`${assetBaseUrl}${image.url}`}
              width={gifWidth}
              height={gifHeight}
              fit="fill"
              loopBehavior="loop"
              style={{
                position: "absolute",
                left: ((width - gifWidth) * imagePosition) / 100,
                top: ((height - gifHeight) * imageY) / 100,
              }}
            />
          ) : (
            <Img
              src={`${assetBaseUrl}${image.url}`}
              style={{
                position: "absolute",
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: `${imagePosition}% ${imageY}%`,
                transform: `scale(${zoom})`,
                transformOrigin: `${imagePosition}% ${imageY}%`,
              }}
            />
          )}
          <AbsoluteFill
            style={{ background: `rgba(4, 17, 18, ${imageDim})` }}
          />
        </>
      )}
      <AbsoluteFill
        style={{
          opacity: fade,
          padding: vertical ? "180px 110px 260px" : "90px 170px",
          alignItems: "center",
        }}
      >
        <div
          style={{
            fontFamily: "Arial, sans-serif",
            fontSize: settings
              ? Math.min(
                  vertical ? 27 : 25,
                  availableWidth / Math.max(1, visual.branding.length) - 3,
                )
              : vertical
                ? 27
                : 25,
            letterSpacing: settings ? 3 : 7,
            color: visual.accentColor,
          }}
        >
          {visual.branding}
        </div>
        <div
          style={{
            marginTop: 24,
            width: 60,
            height: 2,
            background: colors[2],
            opacity: 0.8,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: vertical ? 110 : 240,
            right: vertical ? 130 : 240,
            top: textPanelTop,
            height: textPanelHeight,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: visual.alignment === "left" ? "flex-start" : "center",
            textAlign: visual.alignment,
          }}
        >
          {cue?.kind === "quote" && (
            <div
              style={{
                fontSize: vertical ? 26 : 23,
                fontFamily: "Arial, sans-serif",
                letterSpacing: 3,
                color: visual.accentColor,
                marginBottom: 28,
              }}
            >
              {cue.sourceKind === "hadith"
                ? "HADITH · TRANSLATION"
                : "QUR’AN · TRANSLATION"}
            </div>
          )}
          <div
            style={{
              fontSize: fittedSize,
              lineHeight: visual.lineHeight,
              whiteSpace: settings ? "pre-line" : undefined,
              overflowWrap: settings ? "anywhere" : undefined,
              textWrap: "balance",
              opacity: textOpacity,
              textShadow: "0 3px 15px #0004",
            }}
          >
            {visibleText}
          </div>
          {cue?.kind === "quote" && (
            <div
              style={{
                fontSize: attributionSize,
                fontFamily: "Arial, sans-serif",
                lineHeight: 1.5,
                marginTop: 32,
                color: visual.accentColor,
              }}
            >
              {cue.sourceKind === "hadith" ? "Hadith" : "Qur’an"}{" "}
              {cue.reference}
              <br />
              {cue.edition}
            </div>
          )}
        </div>
        <div
          style={{
            position: "absolute",
            bottom: vertical ? 270 : 92,
            left: vertical ? 110 : 170,
            right: vertical ? 130 : 170,
            textAlign: "center",
            fontFamily: "Arial, sans-serif",
            fontSize: vertical ? 23 : 21,
            lineHeight: 1.6,
            color: visual.accentColor,
          }}
        >
          {data.draft && <div>PRIVATE DRAFT · NOT CLEARED FOR PUBLICATION</div>}
          <div style={{ fontSize: vertical ? 21 : 19, opacity: 0.8 }}>
            {data.attribution}
          </div>
        </div>
      </AbsoluteFill>
      {data.audioUrl && (
        <Sequence
          from={Math.round((data.audioOffset ?? 0) * fps)}
          layout="none"
        >
          <Audio
            src={`${assetBaseUrl}${data.audioUrl}`}
            volume={data.version === 1 ? data.narrationVolume : gains.narration}
          />
        </Sequence>
      )}
      {data.music && (
        <Audio
          src={`${assetBaseUrl}${data.music.url}`}
          trimBefore={
            settings ? Math.round(settings.musicStart * fps) : undefined
          }
          trimAfter={
            settings?.musicEnd !== null && settings?.musicEnd !== undefined
              ? Math.round(settings.musicEnd * fps)
              : undefined
          }
          loop={data.musicLoop ?? true}
          loopVolumeCurveBehavior="extend"
          volume={(f) =>
            gains.music *
            (settings
              ? musicGainAt(
                  f / fps,
                  data.musicLoop === false
                    ? Math.min(
                        data.duration,
                        (settings.musicEnd ?? data.music!.duration) -
                          settings.musicStart,
                      )
                    : data.duration,
                  settings.musicFadeIn,
                  settings.musicFadeOut,
                  settings.musicDuck,
                  data.cues,
                  Boolean(data.audioUrl),
                )
              : musicEnvelope(
                  f,
                  fps,
                  data.musicLoop === false
                    ? Math.min(data.duration, data.music!.duration)
                    : data.duration,
                  data.musicFade ?? 3,
                ))
          }
        />
      )}
    </AbsoluteFill>
  );
}
