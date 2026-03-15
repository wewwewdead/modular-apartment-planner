export type ReactionType =
  | 'fire'
  | 'heart'
  | 'mind_blown'
  | 'clap'
  | 'laugh'
  | 'sad';

export const REACTION_TYPES: {type: ReactionType; emoji: string; label: string}[] = [
  {type: 'fire', emoji: '\uD83D\uDD25', label: 'Fire'},
  {type: 'heart', emoji: '\u2764\uFE0F', label: 'Heart'},
  {type: 'mind_blown', emoji: '\uD83E\uDD2F', label: 'Mind Blown'},
  {type: 'clap', emoji: '\uD83D\uDC4F', label: 'Clap'},
  {type: 'laugh', emoji: '\uD83D\uDE02', label: 'Laugh'},
  {type: 'sad', emoji: '\uD83D\uDE22', label: 'Sad'},
];

export function getReactionEmoji(type: string | null | undefined): string | null {
  if (!type) return null;
  const found = REACTION_TYPES.find(r => r.type === type);
  return found?.emoji ?? null;
}
