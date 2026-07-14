import { useEffect, useRef, useState } from 'react';
import {
  ART_DRAW_SECONDS_CHOICES,
  ART_MAX_PLAYER_CHOICES,
  ART_MODES,
  ART_MODE_NAMES,
  ART_MODE_TAGLINES,
  ART_REVEAL_SECONDS_CHOICES,
  ART_ROUNDS_CHOICES,
  ART_WORD_CHOICE_COUNTS,
  parseCustomPairs,
  parseCustomWords,
  type ArtDrawSeconds,
  type ArtMode,
  type ArtSettings,
} from '@shared/art';
import { THEMES, type ThemeId } from '@shared/settings';
import { updateSettings } from '../../socket';
import { useStore } from '../../store';

const HOW_TO: Record<ArtMode, string> = {
  swap: 'Everyone starts a drawing of their own prompt. When the timer ends, canvases swap — you continue whatever landed in front of you. After everyone has touched every canvas, the results are revealed.',
  imposter:
    'Everyone secretly draws their word, but one artist was given a similar — yet different — word. Study the drawings, then vote for the imposter. Spot them to score; fool the room to score bigger.',
  guess:
    'One player draws their secret word while everyone else races to guess it in the chat. Faster guesses score more, and the drawer earns points per correct guess. Letters get revealed as time runs out.',
};

/** A textarea that patches settings on blur but stays editable while typing. */
function CustomListField(props: {
  label: string;
  value: string;
  disabled: boolean;
  placeholder: string;
  count: string;
  onCommit: (value: string) => void;
}) {
  const [text, setText] = useState(props.value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (document.activeElement !== ref.current) setText(props.value);
  }, [props.value]);
  return (
    <label className="setting-row art-custom-row">
      <span>
        {props.label}
        <span className="art-custom-count"> {props.count}</span>
      </span>
      <textarea
        ref={ref}
        rows={3}
        value={text}
        disabled={props.disabled}
        placeholder={props.placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== props.value && props.onCommit(text)}
      />
    </label>
  );
}

/** The art-games rules panel shown inside the shared lobby shell. */
export default function ArtSettingsPanel() {
  const lobby = useStore((s) => s.lobby);
  const [error, setError] = useState<string | null>(null);
  if (!lobby || lobby.gameId !== 'art') return null;

  const me = lobby.players.find((p) => p.seat === lobby.yourSeat);
  const isHost = me?.isHost ?? false;
  const settings = lobby.settings as ArtSettings;
  const mode = settings.mode;

  function patch(p: Partial<ArtSettings>) {
    void updateSettings(p as Record<string, unknown>).then((r) => setError(r.ok ? null : r.error));
  }

  const customWordCount = parseCustomWords(settings.customWords).length;
  const customPairCount = parseCustomPairs(settings.customPairs).length;

  return (
    <>
      <h2 className="section-title">Game mode</h2>
      <div className="art-mode-picker">
        {ART_MODES.map((m) => (
          <button
            key={m}
            className={`art-mode-card${mode === m ? ' active' : ''}`}
            disabled={!isHost}
            onClick={() => mode !== m && patch({ mode: m })}
          >
            <span className="art-mode-name">{ART_MODE_NAMES[m]}</span>
            <span className="art-mode-tag">{ART_MODE_TAGLINES[m]}</span>
          </button>
        ))}
      </div>

      <h2 className="section-title">Settings</h2>
      <div className="settings">
        <label className="setting-row">
          <span>⏱️ Drawing time</span>
          <select
            disabled={!isHost}
            value={settings.drawSeconds}
            onChange={(e) => patch({ drawSeconds: Number(e.target.value) as ArtDrawSeconds })}
          >
            {ART_DRAW_SECONDS_CHOICES.map((s) => (
              <option key={s} value={s}>
                {s} seconds
              </option>
            ))}
          </select>
        </label>

        {mode !== 'swap' && (
          <label className="setting-row">
            <span>🔁 Rounds</span>
            <select
              disabled={!isHost}
              value={settings.rounds}
              onChange={(e) => patch({ rounds: Number(e.target.value) })}
            >
              {ART_ROUNDS_CHOICES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        )}

        {mode === 'swap' && (
          <>
            <label className="setting-row">
              <span>🔀 Swaps</span>
              <select
                disabled={!isHost}
                value={settings.swapCount}
                onChange={(e) => patch({ swapCount: Number(e.target.value) })}
              >
                <option value={0}>Auto — one per player</option>
                {[2, 3, 4, 5, 6, 8, 10, 12].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="setting-row">
              <span>🖼️ Reveal time</span>
              <select
                disabled={!isHost}
                value={settings.revealSeconds}
                onChange={(e) => patch({ revealSeconds: Number(e.target.value) })}
              >
                {ART_REVEAL_SECONDS_CHOICES.map((s) => (
                  <option key={s} value={s}>
                    {s} seconds per drawing
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        {mode === 'guess' && (
          <>
            <label className="setting-row">
              <span>🎯 Word choices</span>
              <select
                disabled={!isHost}
                value={settings.wordChoices}
                onChange={(e) => patch({ wordChoices: Number(e.target.value) })}
              >
                {ART_WORD_CHOICE_COUNTS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="setting-row">
              <span>💡 Letter hints</span>
              <input
                type="checkbox"
                disabled={!isHost}
                checked={settings.hintsEnabled}
                onChange={(e) => patch({ hintsEnabled: e.target.checked })}
              />
            </label>
          </>
        )}

        <label className="setting-row">
          <span>👥 Max players</span>
          <select
            disabled={!isHost}
            value={settings.maxPlayers}
            onChange={(e) => patch({ maxPlayers: Number(e.target.value) })}
          >
            {ART_MAX_PLAYER_CHOICES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <label className="setting-row">
          <span>🎨 Theme</span>
          <select
            disabled={!isHost}
            value={settings.theme}
            onChange={(e) => patch({ theme: e.target.value as ThemeId })}
          >
            {THEMES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        {mode !== 'imposter' && (
          <CustomListField
            label="📝 Custom words"
            count={customWordCount > 0 ? `(${customWordCount} added)` : '(optional)'}
            value={settings.customWords}
            disabled={!isHost}
            placeholder="comma or newline separated — e.g. karaoke, office chair, spaghetti tower"
            onCommit={(customWords) => patch({ customWords })}
          />
        )}

        {mode === 'imposter' && (
          <CustomListField
            label="📝 Custom pairs"
            count={customPairCount > 0 ? `(${customPairCount} added)` : '(optional)'}
            value={settings.customPairs}
            disabled={!isHost}
            placeholder={'one pair per line — e.g.\ncroissant / baguette\nsnowboard / surfboard'}
            onCommit={(customPairs) => patch({ customPairs })}
          />
        )}

        <label className="setting-row">
          <span>📌 Use only custom entries</span>
          <input
            type="checkbox"
            disabled={!isHost}
            checked={settings.customOnly}
            onChange={(e) => patch({ customOnly: e.target.checked })}
          />
        </label>
      </div>

      <h2 className="section-title">How to play</h2>
      <div className="howto-body art-rules">
        <p>{HOW_TO[mode]}</p>
        {mode === 'imposter' && <p className="hint">Needs at least 3 players.</p>}
      </div>

      {error && <div className="error">{error}</div>}
    </>
  );
}
