/**
 * v0.2.23: the characters that have a full-height picture (assets/fullbody/<id>.png, made by the owner from
 * docs/FULLBODY_PROMPTS.md) — the fighter cards show it; the others keep the waist-up hero card. Listed
 * here so the cards never ask the server for a picture that isn't there.
 */
import type { CharacterId } from '@blatkom/shared';

export const FULLBODY: ReadonlySet<CharacterId> = new Set<CharacterId>([]);
