import { z } from "zod";
import { hadithSearchSchema } from "@/lib/domain/hadith";
import {
  browseHadith,
  importHadithDataset,
  reviewHadith,
} from "@/lib/server/sources/hadith";
import { mutationAllowed, readJson } from "@/lib/server/http";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = hadithSearchSchema.safeParse({
    importId: params.get("importId") || undefined,
    q: params.get("q") || undefined,
    collection: params.get("collection") || undefined,
    sourceId: params.get("sourceId") || undefined,
    page: params.get("page") || undefined,
  });
  if (!query.success)
    return Response.json(
      { error: "Invalid hadith search filters." },
      { status: 422 },
    );
  try {
    return Response.json(
      {
        ...(await browseHadith(query.data)),
        providerAvailable: Boolean(process.env.SUNNAH_API_KEY),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const missing =
      error instanceof Error && error.message === "HADITH_IMPORT_NOT_FOUND";
    return Response.json(
      {
        error: missing
          ? "Hadith import not found."
          : "Hadith library unavailable. Start the local database and try again.",
      },
      { status: missing ? 404 : 503 },
    );
  }
}
export async function POST(request: Request) {
  if (!mutationAllowed(request))
    return Response.json(
      { error: "Request origin not allowed." },
      { status: 403 },
    );
  try {
    const body = z
      .object({ action: z.enum(["import", "review"]), data: z.unknown() })
      .strict()
      .parse(await readJson(request, 4000000));
    const result =
      body.action === "import"
        ? await importHadithDataset(body.data)
        : await reviewHadith(body.data);
    return Response.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_BODY")
      return Response.json(
        { error: "Use a valid bounded hadith import or review request." },
        { status: 422 },
      );
    if (error instanceof z.ZodError)
      return Response.json(
        { error: error.issues[0]?.message || "Invalid hadith record." },
        { status: 422 },
      );
    if (error instanceof Error && error.message === "HADITH_NOT_FOUND")
      return Response.json(
        { error: "Hadith record not found." },
        { status: 404 },
      );
    return Response.json(
      {
        error:
          "Hadith changes could not be saved. Check the database and submitted records.",
      },
      { status: 503 },
    );
  }
}
