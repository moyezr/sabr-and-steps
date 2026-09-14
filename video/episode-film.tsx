import { Gif } from "@remotion/gif";
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { mixGains, musicEnvelope } from "../lib/domain/media";
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
  const cue = data.cues.find((c) => t >= c.start && t < c.end);
  const first = data.cues[0];
  const last = data.cues[data.cues.length - 1];
  const opening = t < first.start;
  const closing = t >= last.end;
  const colors = palettes[data.background];
  const fade = interpolate(
    frame,
    [0, 15, durationInFrames - 20, durationInFrames - 1],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const textOpacity = cue
    ? interpolate(t - cue.start, [0, 0.1], [0, 1], {
        extrapolateRight: "clamp",
        extrapolateLeft: "clamp",
      })
    : 1;
  const imageScale =
    data.image?.width && data.image.height
      ? Math.max(width / data.image.width, height / data.image.height)
      : 1;
  const gifWidth = (data.image?.width || width) * imageScale;
  const gifHeight = (data.image?.height || height) * imageScale;
  const gains = mixGains(
    data.audioUrl ? data.narrationVolume : 0,
    data.music ? (data.musicVolume ?? 0.2) : 0,
  );
  return (
    <AbsoluteFill
      style={{
        background: colors[0],
        color: "#fff9e9",
        fontFamily: "Georgia, serif",
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
      {data.image && (
        <>
          {data.image.mime === "image/gif" ? (
            <Gif
              src={`${assetBaseUrl}${data.image.url}`}
              width={gifWidth}
              height={gifHeight}
              fit="fill"
              loopBehavior="loop"
              style={{
                position: "absolute",
                left: ((width - gifWidth) * (data.imagePosition ?? 50)) / 100,
                top: (height - gifHeight) / 2,
              }}
            />
          ) : (
            <Img
              src={`${assetBaseUrl}${data.image.url}`}
              style={{
                position: "absolute",
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: `${data.imagePosition ?? 50}% 50%`,
              }}
            />
          )}
          <AbsoluteFill
            style={{ background: `rgba(4, 17, 18, ${data.imageDim ?? 0.45})` }}
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
            fontSize: vertical ? 27 : 25,
            letterSpacing: 7,
            color: "#e5d7b6",
          }}
        >
          SABR & STEPS
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
            top: vertical ? "34%" : "30%",
            height: vertical ? "32%" : "40%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          {cue?.kind === "quote" && (
            <div
              style={{
                fontSize: vertical ? 26 : 23,
                fontFamily: "Arial, sans-serif",
                letterSpacing: 3,
                color: "#e5d7b6",
                marginBottom: 28,
              }}
            >
              QUR’AN · TRANSLATION
            </div>
          )}
          <div
            style={{
              fontSize: vertical ? 74 : 84,
              lineHeight: 1.24,
              textWrap: "balance",
              opacity: textOpacity,
              textShadow: "0 3px 15px #0004",
            }}
          >
            {cue
              ? cue.text
              : opening
                ? data.title
                : closing
                  ? "One gentle step at a time."
                  : ""}
          </div>
          {cue?.kind === "quote" && (
            <div
              style={{
                fontSize: vertical ? 25 : 25,
                fontFamily: "Arial, sans-serif",
                lineHeight: 1.5,
                marginTop: 32,
                color: "#e5d7b6",
              }}
            >
              Qur’an {cue.reference}
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
            color: "#e5d7b6",
          }}
        >
          {data.draft && <div>PRIVATE DRAFT · NOT CLEARED FOR PUBLICATION</div>}
          <div style={{ fontSize: vertical ? 21 : 19, opacity: 0.8 }}>
            {data.attribution}
          </div>
        </div>
      </AbsoluteFill>
      {data.audioUrl && (
        <Audio
          src={`${assetBaseUrl}${data.audioUrl}`}
          volume={data.version === 1 ? data.narrationVolume : gains.narration}
        />
      )}
      {data.music && (
        <Audio
          src={`${assetBaseUrl}${data.music.url}`}
          loop={data.musicLoop ?? true}
          loopVolumeCurveBehavior="extend"
          volume={(f) =>
            gains.music *
            musicEnvelope(
              f,
              fps,
              data.musicLoop === false
                ? Math.min(data.duration, data.music!.duration)
                : data.duration,
              data.musicFade ?? 3,
            )
          }
        />
      )}
    </AbsoluteFill>
  );
}
