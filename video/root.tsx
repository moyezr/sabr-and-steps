import { Composition, registerRoot } from "remotion";
import { EpisodeFilm, type FilmProps } from "./episode-film";
import { compositionSchema } from "../lib/domain/media";
const placeholder: FilmProps = {
  data: {
    version: 1,
    title: "Sabr & Steps",
    scriptChecksum: "",
    voiceChecksum: "",
    captionChecksum: "",
    duration: 5,
    fps: 30,
    cues: [{ start: 0, end: 5, text: "One gentle step.", kind: "reflection" }],
    audioUrl: "/audio.mp3",
    background: "forest",
    ambience: "none",
    ambienceVolume: 0,
    narrationVolume: 1,
    draft: true,
    attribution: "",
  },
};
function Root() {
  return (
    <>
      {(["Landscape", "Vertical"] as const).map((id) => (
        <Composition
          key={id}
          id={id}
          component={EpisodeFilm}
          defaultProps={placeholder}
          fps={30}
          durationInFrames={150}
          width={id === "Landscape" ? 1920 : 1080}
          height={id === "Landscape" ? 1080 : 1920}
          calculateMetadata={({ props }) => {
            const data = compositionSchema.parse(props.data);
            return { durationInFrames: Math.ceil(data.duration * 30) };
          }}
        />
      ))}
    </>
  );
}
registerRoot(Root);
