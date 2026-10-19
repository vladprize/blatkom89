/**
 * Profile avatars: round pixel-art portraits of district types drawn by the product owner
 * (references/23-avatars.png, cut by tools/crop-avatars.py into apps/web/public/assets/avatars/<id>.jpg).
 * Free for everyone, a player picks one in the profile; without one the game shows the character's
 * portrait. The id is all that is stored (profiles.avatar) and sent to other players in the lobby.
 */
export const AVATAR_IDS = [
  'shades',
  'tracksuit',
  'blonde',
  'ushanka',
  'flatcap',
  'balaclava',
  'bob',
  'resort',
  'thinker',
  'agent',
  'smoker',
  'dog',
  'veteran',
  'hood',
  'brick',
  'tattoo',
  'furcoat',
  'panama',
  'militia',
  'disco',
  'shotgun',
  'babushka',
  'driver',
  'tram',
] as const;

export type AvatarId = (typeof AVATAR_IDS)[number];

const AVATAR_SET: ReadonlySet<string> = new Set(AVATAR_IDS);

export function isAvatarId(v: unknown): v is AvatarId {
  return typeof v === 'string' && AVATAR_SET.has(v);
}
