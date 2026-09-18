import "server-only";

import { cache } from "react";
import { summarizeWorkspace } from "../../domain/workspace";
import { mediaState } from "../media/state";

export const getEpisodeWorkspace = cache(async (episodeId: string) => {
  return summarizeWorkspace(await mediaState(episodeId));
});
