import { EpisodeEditor } from "@/components/episode-editor";
import { THEMES } from "@/lib/domain/episode";

export default async function NewEpisode({
  searchParams,
}: {
  searchParams: Promise<{ theme?: string; title?: string }>;
}) {
  const params = await searchParams;
  const theme = THEMES.find((theme) => theme === params.theme);
  return (
    <EpisodeEditor
      initial={{
        ...(theme ? { theme } : {}),
        ...(typeof params.title === "string"
          ? { title: params.title.slice(0, 140) }
          : {}),
      }}
    />
  );
}
