import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ART_SETTINGS,
  parseCustomPairs,
  parseCustomWords,
  type ArtSettings,
  type ArtView,
} from '@shared/art';
import {
  applyArtAction,
  artSettleDisconnected,
  artTick,
  artTimeout,
  editDistance,
  hintCountFor,
  maskWord,
  maskableIndices,
  newArtGame,
  normalizeGuess,
  swapCanvasIndex,
  type ArtState,
  type GuessArtState,
  type ImposterArtState,
  type SwapArtState,
} from './engine';
import { artModule as m } from './index';
import { sanitizeArtSettings } from './settings';

function settings(patch: Partial<ArtSettings> = {}): ArtSettings {
  return { ...DEFAULT_ART_SETTINGS, ...patch };
}

function seatMeta(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    nickname: `P${i}`,
    connected: true,
    isHost: i === 0,
    wins: 0,
  }));
}

function redact(state: ArtState, viewer: number, n: number): ArtView {
  return m.redactFor(state, viewer, seatMeta(n), null, false) as ArtView;
}

function stroke(cv: string, id = 1, pts = [10, 10, 20, 20]) {
  return { t: 'stroke' as const, cv, id, color: '#112233', size: 8, pts };
}

/** Drain timers until the game ends or `max` transitions happen. */
function runTimeouts(state: ArtState, max: number): void {
  for (let i = 0; i < max && !state.over; i++) artTimeout(state);
}

// ── shared helpers ──────────────────────────────────────────────────────────

describe('art words & helpers', () => {
  it('parses custom words with dedupe, trimming, and caps', () => {
    const words = parseCustomWords('  cat ,dog\nCAT; ice cream,x,!bad!,dog ');
    expect(words).toEqual(['cat', 'dog', 'ice cream']);
  });

  it('parses custom pairs from "a / b" lines', () => {
    const pairs = parseCustomPairs('cat / fox\nbad line\npizza/pie\ncat/cat');
    expect(pairs).toEqual([
      ['cat', 'fox'],
      ['pizza', 'pie'],
    ]);
  });

  it('masks words and reveals hints in order', () => {
    const word = 'ice cream';
    const idx = maskableIndices(word);
    expect(idx).toEqual([0, 1, 2, 4, 5, 6, 7, 8]);
    expect(maskWord(word, idx, 0)).toBe('___ _____');
    expect(maskWord(word, idx, 2)).toBe('ic_ _____');
  });

  it('ramps hint counts with elapsed time and never reveals everything', () => {
    expect(hintCountFor(8, 0.1, true)).toBe(0);
    expect(hintCountFor(8, 0.3, true)).toBe(1);
    expect(hintCountFor(8, 0.6, true)).toBe(3);
    expect(hintCountFor(8, 0.8, true)).toBe(5);
    expect(hintCountFor(2, 0.9, true)).toBe(1);
    expect(hintCountFor(8, 0.9, false)).toBe(0);
  });

  it('normalizes guesses and measures near-misses', () => {
    expect(normalizeGuess('  Ice   CREAM ')).toBe('ice cream');
    expect(editDistance('elephant', 'elephant')).toBe(0);
    expect(editDistance('elephont', 'elephant')).toBe(1);
    expect(editDistance('elefant', 'elephant')).toBe(2);
    expect(editDistance('dog', 'octopus')).toBeGreaterThan(2);
  });
});

describe('art settings', () => {
  it('accepts valid patches and rejects junk', () => {
    const s = sanitizeArtSettings(settings(), { mode: 'swap', drawSeconds: 45 });
    expect(s?.mode).toBe('swap');
    expect(s?.drawSeconds).toBe(45);
    expect(sanitizeArtSettings(settings(), { mode: 'karaoke' as never })).toBeNull();
    expect(sanitizeArtSettings(settings(), { drawSeconds: 7 as never })).toBeNull();
    expect(sanitizeArtSettings(settings(), { rounds: 99 as never })).toBeNull();
  });

  it('module player bounds follow the mode and the host cap', () => {
    expect(m.playerBounds!(settings({ mode: 'imposter' }))).toEqual({ min: 3, max: 8 });
    expect(m.playerBounds!(settings({ mode: 'swap', maxPlayers: 4 }))).toEqual({ min: 2, max: 4 });
  });

  it('validates wire actions structurally', () => {
    expect(m.validateAction(stroke('s0'))).toBe(true);
    expect(m.validateAction({ t: 'stroke', cv: '../etc', id: 1, color: '#fff', size: 2, pts: [] })).toBe(false);
    expect(m.validateAction({ t: 'guess', text: 'hello' })).toBe(true);
    expect(m.validateAction({ t: 'guess', text: '' })).toBe(false);
    expect(m.validateAction({ t: 'vote', seat: 1 })).toBe(true);
    expect(m.validateAction({ t: 'place', board: 0, cell: 0 })).toBe(false);
  });
});

// ── swap artist ─────────────────────────────────────────────────────────────

describe('swap artist', () => {
  const N = 4;
  function newSwap(seed = 7): SwapArtState {
    return newArtGame(settings({ mode: 'swap' }), N, 0, 1, seed).state as SwapArtState;
  }

  it('gives every player a unique canvas each turn and full coverage overall', () => {
    const s = newSwap();
    expect(s.turns).toBe(N);
    const seen = Array.from({ length: N }, () => new Set<number>());
    for (let turn = 0; turn < s.turns; turn++) {
      const assigned = new Set<number>();
      for (let seat = 0; seat < N; seat++) {
        const c = swapCanvasIndex(s, seat, turn);
        assigned.add(c);
        seen[seat]!.add(c);
      }
      expect(assigned.size).toBe(N); // a bijection every turn
    }
    for (const visited of seen) expect(visited.size).toBe(N); // everyone drew everywhere
  });

  it('honors a shorter swap count', () => {
    const s = newArtGame(settings({ mode: 'swap', swapCount: 2 }), N, 0, 1, 3).state as SwapArtState;
    expect(s.turns).toBe(2);
  });

  it('accepts strokes only on your assigned canvas and keeps them private', () => {
    const s = newSwap();
    const mine = s.canvases[swapCanvasIndex(s, 0)]!;
    const theirs = s.canvases[swapCanvasIndex(s, 1)]!;
    const res = applyArtAction(s, 0, stroke(mine.key));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.sync).toBe('none'); // private while drawing
    expect(applyArtAction(s, 0, stroke(theirs.key)).ok).toBe(false);
    expect(mine.strokes).toHaveLength(1);
  });

  it('appends chunks to the same stroke id and undoes only your own work', () => {
    const s = newSwap();
    const mine = s.canvases[swapCanvasIndex(s, 0)]!;
    applyArtAction(s, 0, stroke(mine.key, 5, [1, 1, 2, 2]));
    applyArtAction(s, 0, stroke(mine.key, 5, [3, 3]));
    expect(mine.strokes).toHaveLength(1);
    expect(mine.strokes[0]!.pts).toEqual([1, 1, 2, 2, 3, 3]);
    expect(applyArtAction(s, 0, { t: 'strokeUndo', cv: mine.key, id: 5 }).ok).toBe(true);
    expect(mine.strokes).toHaveLength(0);
  });

  it('rotates canvases when the timer fires, keeping earlier strokes', () => {
    const s = newSwap();
    const first = s.canvases[swapCanvasIndex(s, 0)]!;
    applyArtAction(s, 0, stroke(first.key));
    artTimeout(s);
    expect(s.turn).toBe(1);
    const second = s.canvases[swapCanvasIndex(s, 0)]!;
    expect(second.key).not.toBe(first.key);
    expect(first.strokes).toHaveLength(1); // previous work survives
    expect(first.contributors).toEqual([0]);
  });

  it('advances early when every connected player is done', () => {
    const s = newSwap();
    for (let seat = 0; seat < N - 1; seat++) applyArtAction(s, seat, { t: 'done', done: true });
    expect(s.turn).toBe(0);
    applyArtAction(s, N - 1, { t: 'done', done: true });
    expect(s.turn).toBe(1);
    expect(s.done.every((d) => !d)).toBe(true); // reset for the new turn
  });

  it('reveals canvases one by one, then lands in the gallery', () => {
    const s = newSwap();
    runTimeouts(s, N); // all drawing turns
    expect(s.phase).toBe('reveal');
    expect(s.revealIndex).toBe(0);
    applyArtAction(s, 2, { t: 'advance' }); // anyone may skip ahead
    expect(s.revealIndex).toBe(1);
    runTimeouts(s, N);
    expect(s.phase).toBe('gallery');
    expect(s.over).toBe(true);
    expect(m.isRoundOver(s)).toBe(true);
  });

  it('only shows the viewer their own canvas and prompt while drawing', () => {
    const s = newSwap();
    const v = redact(s, 0, N);
    expect(v.canvases).toHaveLength(1);
    expect(v.canvases[0]!.key).toBe(s.canvases[swapCanvasIndex(s, 0)]!.key);
    expect(v.yourPrompt).toBe(s.canvases[swapCanvasIndex(s, 0)]!.prompt);
    expect(v.swap!.entries).toHaveLength(0); // no prompt spoilers before reveal
  });
});

// ── imposter ────────────────────────────────────────────────────────────────

describe('imposter drawing', () => {
  const N = 4;
  function newImposter(seed = 11, rounds = 1): ImposterArtState {
    return newArtGame(settings({ mode: 'imposter', rounds }), N, 0, 1, seed)
      .state as ImposterArtState;
  }

  it('hands one player a different prompt', () => {
    const s = newImposter();
    const prompts = s.canvases.map((c) => c.prompt);
    const odd = prompts.filter((p) => p === s.imposterWord);
    expect(odd).toHaveLength(1);
    expect(prompts[s.imposterSeat]).toBe(s.imposterWord);
    expect(prompts.filter((p) => p === s.commonWord)).toHaveLength(N - 1);
  });

  it('keeps drawings and prompts private until the vote', () => {
    const s = newImposter();
    applyArtAction(s, 1, stroke(s.canvases[1]!.key));
    const v = redact(s, 0, N);
    expect(v.canvases).toHaveLength(1);
    expect(v.canvases[0]!.ownerSeat).toBe(0);
    expect(v.yourPrompt).toBe(s.canvases[0]!.prompt);
    expect(JSON.stringify(v)).not.toContain(
      s.imposterSeat === 0 ? s.commonWord : s.imposterWord,
    );
    expect(v.imposter!.result).toBeNull();
  });

  it('reveals all drawings for the vote, then tallies when everyone voted', () => {
    const s = newImposter();
    artTimeout(s); // drawing over
    expect(s.phase).toBe('vote');
    const v = redact(s, 0, N);
    expect(v.canvases).toHaveLength(N);
    const target = s.imposterSeat;
    for (let seat = 0; seat < N; seat++) {
      if (seat === target) continue;
      const res = applyArtAction(s, seat, { t: 'vote', seat: target });
      expect(res.ok).toBe(true);
    }
    expect(s.phase).toBe('vote'); // imposter still owes a vote
    applyArtAction(s, target, { t: 'vote', seat: (target + 1) % N });
    expect(s.phase).toBe('result');
    expect(s.lastResult!.caught).toBe(true);
    // every correct voter scored
    for (let seat = 0; seat < N; seat++) {
      expect(s.scores[seat]).toBe(seat === target ? 0 : 100);
    }
  });

  it('rewards an undetected imposter, with a bonus for zero votes', () => {
    const s = newImposter();
    artTimeout(s);
    const imp = s.imposterSeat;
    const scapegoat = (imp + 1) % N;
    for (let seat = 0; seat < N; seat++) {
      const target = seat === scapegoat ? (imp + 2) % N : scapegoat;
      if (target !== seat) applyArtAction(s, seat, { t: 'vote', seat: target });
    }
    expect(s.phase).toBe('result');
    expect(s.lastResult!.caught).toBe(false);
    expect(s.scores[imp]).toBe(350); // 250 escape + 100 untouched
  });

  it('self-votes are rejected', () => {
    const s = newImposter();
    artTimeout(s);
    expect(applyArtAction(s, 1, { t: 'vote', seat: 1 }).ok).toBe(false);
  });

  it('plays the configured rounds then crowns the top score', () => {
    const s = newImposter(19, 2);
    for (let round = 0; round < 2; round++) {
      artTimeout(s); // end drawing
      const imp = s.imposterSeat;
      for (let seat = 0; seat < N; seat++) {
        const target = seat === imp ? (imp + 1) % N : imp;
        applyArtAction(s, seat, { t: 'vote', seat: target });
      }
      expect(s.phase).toBe('result');
      const events = artTimeout(s); // next round / final
      if (round === 1) {
        expect(s.phase).toBe('final');
        expect(events.some((e) => e.t === 'win')).toBe(true);
      }
    }
    expect(s.over).toBe(true);
    const top = Math.max(...s.scores);
    for (const seat of s.winnerSeats) expect(s.scores[seat]).toBe(top);
  });

  it('a vote in progress settles when the last holdout disconnects', () => {
    const s = newImposter();
    artTimeout(s);
    const imp = s.imposterSeat;
    for (let seat = 0; seat < N; seat++) {
      if (seat === imp) continue;
      applyArtAction(s, seat, { t: 'vote', seat: imp });
    }
    artSettleDisconnected(s, (seat) => seat !== imp);
    expect(s.phase).toBe('result');
  });
});

// ── guess the word ──────────────────────────────────────────────────────────

describe('guess the word', () => {
  const N = 3;
  function newGuess(seed = 5, rounds = 1): GuessArtState {
    return newArtGame(
      settings({ mode: 'guess', rounds, drawSeconds: 60, wordChoices: 3 }),
      N,
      0,
      1,
      seed,
    ).state as GuessArtState;
  }

  it('offers word choices to the drawer only', () => {
    const s = newGuess();
    expect(s.phase).toBe('choose');
    expect(s.drawerSeat).toBe(0);
    expect(s.choices).toHaveLength(3);
    expect(redact(s, 0, N).guess!.choices).toEqual(s.choices);
    expect(redact(s, 1, N).guess!.choices).toBeNull();
  });

  it('never leaks the word to guessers, only a masked pattern', () => {
    const s = newGuess();
    applyArtAction(s, 0, { t: 'chooseWord', index: 0 });
    expect(s.phase).toBe('draw');
    const word = s.word!;
    const guesser = redact(s, 1, N);
    expect(guesser.guess!.word).toBeNull();
    expect(guesser.guess!.wordPattern!.length).toBe(word.length);
    expect(guesser.guess!.wordPattern).not.toBe(word);
    expect(JSON.stringify(guesser)).not.toContain(`"${word}"`);
    expect(redact(s, 0, N).guess!.word).toBe(word);
  });

  it('streams drawer strokes as events, skipping the drawer itself', () => {
    const s = newGuess();
    applyArtAction(s, 0, { t: 'chooseWord', index: 1 });
    const res = applyArtAction(s, 0, stroke(s.canvas!.key));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.sync).toBe('events');
      expect(res.exceptSeat).toBe(0);
      expect(res.events[0]!.t).toBe('stroke');
    }
    expect(applyArtAction(s, 1, stroke(s.canvas!.key)).ok).toBe(false); // guessers can't draw
  });

  it('scores fast guesses higher and locks repeat guessing', () => {
    const s = newGuess();
    applyArtAction(s, 0, { t: 'chooseWord', index: 0 });
    const word = s.word!;
    for (let i = 0; i < 30; i++) artTick(s); // half the timer gone
    const r1 = applyArtAction(s, 1, { t: 'guess', text: word.toUpperCase() });
    expect(r1.ok).toBe(true);
    const halfPoints = s.scores[1]!;
    expect(halfPoints).toBeGreaterThanOrEqual(190);
    expect(halfPoints).toBeLessThanOrEqual(210);
    // Their later "guesses" are insider chat, not double scores.
    applyArtAction(s, 1, { t: 'guess', text: word });
    expect(s.scores[1]).toBe(halfPoints);
    expect(s.correct).toHaveLength(1);
  });

  it('ends the turn once every guesser has it, paying the drawer per guess', () => {
    const s = newGuess();
    applyArtAction(s, 0, { t: 'chooseWord', index: 0 });
    const word = s.word!;
    applyArtAction(s, 1, { t: 'guess', text: word });
    expect(s.phase).toBe('draw');
    applyArtAction(s, 2, { t: 'guess', text: word });
    expect(s.phase).toBe('turnResult');
    expect(s.turnResult!.everyoneGuessed).toBe(true);
    expect(s.scores[0]).toBe(100); // 2 × 50 drawer points
    expect(s.archive).toHaveLength(1);
    expect(s.archive[0]!.word).toBe(word);
    expect(s.archive[0]!.correct).toHaveLength(2);
  });

  it('hides insider chat from active guessers and close-calls from others', () => {
    const s = newGuess();
    applyArtAction(s, 0, { t: 'chooseWord', index: 0 });
    const word = s.word!;
    applyArtAction(s, 1, { t: 'guess', text: word });
    applyArtAction(s, 1, { t: 'guess', text: 'nice drawing lol' });
    const active = redact(s, 2, N).guess!.messages;
    expect(active.some((msg) => msg.text === 'nice drawing lol')).toBe(false);
    const insider = redact(s, 0, N).guess!.messages;
    expect(insider.some((msg) => msg.text === 'nice drawing lol')).toBe(true);
    // near-miss nudge is private to the guesser
    const near = word.slice(0, word.length - 1) + '_';
    applyArtAction(s, 2, { t: 'guess', text: near });
    const mine = redact(s, 2, N).guess!.messages;
    const others = redact(s, 0, N).guess!.messages;
    expect(mine.some((msg) => msg.kind === 'close')).toBe(true);
    expect(others.some((msg) => msg.kind === 'close')).toBe(false);
  });

  it('reveals letters as the clock runs down', () => {
    const s = newGuess();
    applyArtAction(s, 0, { t: 'chooseWord', index: 0 });
    expect(s.hintCount).toBe(0);
    let changed = false;
    for (let i = 0; i < 31 && !changed; i++) changed = artTick(s).changed;
    expect(changed).toBe(true);
    expect(s.hintCount).toBeGreaterThan(0);
    const pattern = redact(s, 1, N).guess!.wordPattern!;
    expect(pattern.split('').some((ch) => ch !== '_' && ch !== ' ')).toBe(true);
  });

  it('auto-picks for a sleeping drawer and rotates through everyone', () => {
    const s = newGuess();
    expect(s.turnCount).toBe(N);
    const drawers: number[] = [];
    for (let t = 0; t < N; t++) {
      drawers.push(s.drawerSeat);
      if (s.phase === 'choose') artTimeout(s); // auto-pick
      expect(s.phase).toBe('draw');
      artTimeout(s); // drawing timer
      expect(s.phase).toBe('turnResult');
      artTimeout(s); // next turn
    }
    expect(s.phase).toBe('final');
    expect(s.over).toBe(true);
    expect(drawers).toEqual([0, 1, 2]);
  });

  it('final view carries archive metadata and stats, not stroke payloads', () => {
    const s = newGuess();
    applyArtAction(s, 0, { t: 'chooseWord', index: 0 });
    applyArtAction(s, 0, stroke(s.canvas!.key));
    const word = s.word!;
    applyArtAction(s, 1, { t: 'guess', text: word });
    applyArtAction(s, 2, { t: 'guess', text: word });
    artTimeout(s); // turnResult → next
    runTimeouts(s, 3 * N);
    expect(s.phase).toBe('final');
    const v = redact(s, 1, N);
    expect(v.guess!.archive).toHaveLength(N);
    expect(v.guess!.archive![0]!.correct).toHaveLength(2);
    expect((v.guess!.archive![0] as { strokes?: unknown }).strokes).toBeUndefined();
    const stats = v.guess!.stats!;
    expect(stats[1]!.correctGuesses).toBe(1);
    expect(stats[0]!.drawingsCompleted).toBe(1);
    expect(stats[1]!.avgGuessMs).not.toBeNull();
    // resync rebuilds the archived drawing for a rejoiner
    const events = m.resyncEvents!(s, 1);
    expect(events.some((e) => e.t === 'stroke' && e.cv === 't0')).toBe(true);
  });

  it('skips disconnected drawers instead of stalling', () => {
    const s = newGuess(23);
    applyArtAction(s, 0, { t: 'chooseWord', index: 0 });
    artTimeout(s); // end drawing
    artSettleDisconnected(s, (seat) => seat !== 1); // seat 1 leaves
    artTimeout(s); // turnResult → would be seat 1's turn
    expect(s.drawerSeat).toBe(2);
    expect(s.phase).toBe('choose');
  });
});
