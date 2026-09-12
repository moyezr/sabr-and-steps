import nextEnv from "@next/env";
import { QuranClient, QuranError } from "../lib/server/providers/quran";
nextEnv.loadEnvConfig(process.cwd());
async function main() {
  try {
    const client = new QuranClient();
    console.log("Environment:", client.environment);
    const resources = await client.resources();
    console.log(JSON.stringify(resources, null, 2));
    const id = Number(process.argv[2]);
    if (Number.isInteger(id) && id > 0) {
      console.log(
        JSON.stringify(
          await client.get(`resources/translations/${id}/info`),
          null,
          2,
        ),
      );
      for (const { id: chapter } of (await client.chapters()).slice(0, 2)) {
        const page = await client.page(id, chapter, 1);
        console.log(
          JSON.stringify(
            {
              chapter,
              pagination: page.pagination,
              samples: page.verses.slice(0, 2),
            },
            null,
            2,
          ),
        );
      }
    }
  } catch (error) {
    console.error(
      error instanceof QuranError
        ? error.code
        : "QF_RESPONSE_VALIDATION_FAILED",
    );
    process.exitCode = 1;
  }
}
void main();
