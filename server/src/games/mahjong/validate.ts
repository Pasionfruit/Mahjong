// 'chowIntent' reserves a chow before the run is chosen; it carries no tileIds.
const CLAIM_KINDS = new Set(['win', 'pong', 'kong', 'chow', 'chowIntent']);
const ACTION_KINDS = new Set([
  'discard',
  'claim',
  'pass',
  'concealedKong',
  'addedKong',
  'winSelfDraw',
]);

/** Runtime guard for a Mahjong action arriving off the wire. */
export function validateAction(a: unknown): boolean {
  if (typeof a !== 'object' || a === null) return false;
  const action = a as Record<string, unknown>;
  if (typeof action.t !== 'string' || !ACTION_KINDS.has(action.t)) return false;
  switch (action.t) {
    case 'discard':
    case 'addedKong':
      return typeof action.tileId === 'number';
    case 'concealedKong':
      return typeof action.kind === 'string';
    case 'claim':
      if (typeof action.claim !== 'string' || !CLAIM_KINDS.has(action.claim)) return false;
      if (action.claim === 'chow') {
        return (
          Array.isArray(action.tileIds) &&
          action.tileIds.length === 2 &&
          action.tileIds.every((id) => typeof id === 'number')
        );
      }
      return true;
    default:
      return true;
  }
}
