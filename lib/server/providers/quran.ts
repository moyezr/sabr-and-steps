import "server-only";
import { z } from "zod";

export class QuranError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
export const resourceSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().min(1),
    author_name: z.string().nullable().optional(),
    language_name: z.string(),
  })
  .passthrough();
export const chapterSchema = z
  .object({
    id: z.number().int().min(1).max(114),
    name_simple: z.string(),
    verses_count: z.number().int().positive(),
  })
  .passthrough();
export const verseSchema = z
  .object({
    verse_key: z.string().regex(/^\d{1,3}:\d{1,3}$/),
    verse_number: z.number().int().positive(),
    text_uthmani: z.string().min(1),
    translations: z.array(
      z
        .object({ resource_id: z.number().int(), text: z.string().min(1) })
        .passthrough(),
    ),
  })
  .passthrough();
export const pageSchema = z
  .object({
    verses: z.array(verseSchema).min(1),
    pagination: z
      .object({
        current_page: z.number().int().positive(),
        next_page: z.number().int().positive().nullable(),
        total_pages: z.number().int().positive(),
        total_records: z.number().int().positive(),
      })
      .passthrough(),
  })
  .passthrough();

export class QuranClient {
  readonly environment: "prelive" | "production";
  private readonly api: string;
  private readonly oauth: string;
  private token?: { value: string; expires: number };
  constructor(
    private readonly env: Record<string, string | undefined> = process.env,
    private readonly request: typeof fetch = fetch,
  ) {
    const environment = env.QF_ENV || "prelive";
    if (environment !== "prelive" && environment !== "production")
      throw new QuranError("QF_ENV_INVALID");
    if (!env.QF_CLIENT_ID || !env.QF_CLIENT_SECRET)
      throw new QuranError("QF_CREDENTIALS_MISSING");
    this.environment = environment;
    this.api =
      environment === "prelive"
        ? "https://apis-prelive.quran.foundation"
        : "https://apis.quran.foundation";
    this.oauth =
      environment === "prelive"
        ? "https://prelive-oauth2.quran.foundation"
        : "https://oauth2.quran.foundation";
  }
  private async json(url: string, init: RequestInit): Promise<unknown> {
    let response: Response;
    try {
      response = await this.request(url, {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new QuranError("QF_NETWORK_ERROR");
    }
    if (!response.ok)
      throw new QuranError(
        response.status === 401 || response.status === 403
          ? "QF_AUTH_FAILED"
          : `QF_HTTP_${response.status}`,
      );
    try {
      return await response.json();
    } catch {
      throw new QuranError("QF_INVALID_RESPONSE");
    }
  }
  private async accessToken() {
    if (this.token && this.token.expires > Date.now()) return this.token.value;
    const parsed = z
      .object({
        access_token: z.string().min(1),
        expires_in: z.number().positive(),
      })
      .safeParse(
        await this.json(`${this.oauth}/oauth2/token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${Buffer.from(`${this.env.QF_CLIENT_ID}:${this.env.QF_CLIENT_SECRET}`).toString("base64")}`,
          },
          body: new URLSearchParams({
            grant_type: "client_credentials",
            scope: "content",
          }).toString(),
        }),
      );
    if (!parsed.success) throw new QuranError("QF_INVALID_TOKEN_RESPONSE");
    this.token = {
      value: parsed.data.access_token,
      expires: Date.now() + Math.max(0, parsed.data.expires_in - 60) * 1000,
    };
    return this.token.value;
  }
  async get(path: string): Promise<unknown> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.accessToken();
      try {
        return await this.json(`${this.api}/content/api/v4/${path}`, {
          headers: {
            "x-auth-token": token,
            "x-client-id": this.env.QF_CLIENT_ID!,
          },
          cache: "no-store",
        });
      } catch (error) {
        if (
          !(error instanceof QuranError) ||
          error.code !== "QF_AUTH_FAILED" ||
          attempt
        )
          throw error;
        this.token = undefined;
      }
    }
    throw new QuranError("QF_AUTH_FAILED");
  }
  async resources() {
    return z
      .object({ translations: z.array(resourceSchema) })
      .parse(await this.get("resources/translations?language=en"))
      .translations.filter((r) => r.language_name.toLowerCase() === "english");
  }
  async chapters() {
    return z
      .object({ chapters: z.array(chapterSchema).min(1).max(114) })
      .parse(await this.get("chapters?language=en")).chapters;
  }
  async page(resource: number, chapter: number, page: number) {
    return pageSchema.parse(
      await this.get(
        `verses/by_chapter/${chapter}?translations=${resource}&fields=text_uthmani&per_page=50&page=${page}`,
      ),
    );
  }
}
