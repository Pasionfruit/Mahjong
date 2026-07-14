import {
  ART_ABSOLUTE_MAX_PLAYERS,
  ART_DRAW_SECONDS_CHOICES,
  ART_MAX_PLAYER_CHOICES,
  ART_MODES,
  ART_REVEAL_SECONDS_CHOICES,
  ART_ROUNDS_CHOICES,
  ART_WORD_CHOICE_COUNTS,
  type ArtSettings,
} from '@shared/art';
import { THEMES } from '@shared/settings';

const MAX_CUSTOM_TEXT = 10_000;

export function sanitizeArtSettings(
  current: ArtSettings,
  patch: Partial<ArtSettings>,
): ArtSettings | null {
  const next = { ...current };
  if (patch.mode !== undefined) {
    if (!(ART_MODES as readonly string[]).includes(patch.mode)) return null;
    next.mode = patch.mode;
  }
  if (patch.theme !== undefined) {
    if (!(THEMES as readonly string[]).includes(patch.theme)) return null;
    next.theme = patch.theme;
  }
  if (patch.maxPlayers !== undefined) {
    if (!(ART_MAX_PLAYER_CHOICES as readonly number[]).includes(patch.maxPlayers)) return null;
    next.maxPlayers = Math.min(patch.maxPlayers, ART_ABSOLUTE_MAX_PLAYERS);
  }
  if (patch.drawSeconds !== undefined) {
    if (!(ART_DRAW_SECONDS_CHOICES as readonly number[]).includes(patch.drawSeconds)) return null;
    next.drawSeconds = patch.drawSeconds;
  }
  if (patch.rounds !== undefined) {
    if (!(ART_ROUNDS_CHOICES as readonly number[]).includes(patch.rounds)) return null;
    next.rounds = patch.rounds;
  }
  if (patch.swapCount !== undefined) {
    if (
      typeof patch.swapCount !== 'number' ||
      !Number.isInteger(patch.swapCount) ||
      patch.swapCount < 0 ||
      patch.swapCount > ART_ABSOLUTE_MAX_PLAYERS
    ) {
      return null;
    }
    next.swapCount = patch.swapCount;
  }
  if (patch.revealSeconds !== undefined) {
    if (!(ART_REVEAL_SECONDS_CHOICES as readonly number[]).includes(patch.revealSeconds)) return null;
    next.revealSeconds = patch.revealSeconds;
  }
  if (patch.wordChoices !== undefined) {
    if (!(ART_WORD_CHOICE_COUNTS as readonly number[]).includes(patch.wordChoices)) return null;
    next.wordChoices = patch.wordChoices;
  }
  if (patch.hintsEnabled !== undefined) {
    if (typeof patch.hintsEnabled !== 'boolean') return null;
    next.hintsEnabled = patch.hintsEnabled;
  }
  if (patch.customWords !== undefined) {
    if (typeof patch.customWords !== 'string') return null;
    next.customWords = patch.customWords.slice(0, MAX_CUSTOM_TEXT);
  }
  if (patch.customPairs !== undefined) {
    if (typeof patch.customPairs !== 'string') return null;
    next.customPairs = patch.customPairs.slice(0, MAX_CUSTOM_TEXT);
  }
  if (patch.customOnly !== undefined) {
    if (typeof patch.customOnly !== 'boolean') return null;
    next.customOnly = patch.customOnly;
  }
  return next;
}
