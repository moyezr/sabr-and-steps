import { z } from "zod";
type Account = {
  character_count: number;
  character_limit: number;
  next_character_count_reset_unix?: number;
};
type Usage = {
  state: string;
  estimated: number;
  actual: number | null;
  details: unknown;
  createdAt: Date;
};
const snapshot = z.object({
  account: z.object({
    character_count: z.number().nonnegative(),
    next_character_count_reset_unix: z.number().optional(),
  }),
});
/** Each dispatch's balance snapshot anchors subsequent local charges, even during provider reporting lag. */
export function availableSpeechCharacters(account: Account, usage: Usage[]) {
  let outstanding = 0,
    settledSince = 0,
    consumed = account.character_count;
  for (const row of [...usage].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  )) {
    if (["reserved", "dispatched", "uncertain"].includes(row.state)) {
      outstanding += row.estimated;
      continue;
    }
    if (row.state !== "settled") continue;
    const prior = snapshot.safeParse(row.details);
    if (!prior.success) {
      outstanding += row.actual ?? row.estimated;
      continue;
    }
    const before = prior.data.account;
    if (
      account.next_character_count_reset_unix !== undefined &&
      before.next_character_count_reset_unix !== undefined &&
      before.next_character_count_reset_unix !==
        account.next_character_count_reset_unix &&
      row.createdAt.getTime() <= before.next_character_count_reset_unix * 1000
    )
      continue;
    settledSince += row.actual ?? row.estimated;
    consumed = Math.max(consumed, before.character_count + settledSince);
  }
  return Math.max(0, account.character_limit - consumed - outstanding);
}
