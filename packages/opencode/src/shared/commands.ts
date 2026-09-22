/** Pure helpers for the server-side ATHENA slash commands. UI-free and deterministic. */

export const ATHENA_MODES = ["shadow", "guardian", "balanced"] as const;
export type AthenaMode = (typeof ATHENA_MODES)[number];

/** Parses `/athena-mode` arguments. Returns null for anything unrecognized. */
export function parseAthenaMode(text: string | undefined | null): AthenaMode | null {
  const value = (text ?? "").trim();
  return (ATHENA_MODES as readonly string[]).includes(value) ? (value as AthenaMode) : null;
}

/** Inline notice for invalid `/athena-mode` input. Contains no secrets. */
export function athenaModeNotice(text: string | undefined | null): string {
  const value = (text ?? "").trim();
  return `mode: shadow | guardian | balanced${value ? ` (got ${value})` : ""}`;
}
