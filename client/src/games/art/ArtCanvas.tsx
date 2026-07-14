import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ART_BRUSH_COLORS,
  ART_BRUSH_SIZES,
  ART_CANVAS_UNITS,
  type ArtStroke,
} from '@shared/art';
import { sendAction } from '../../socket';
import { useStore } from '../../store';

/** Paper color — also what the eraser paints with. */
const PAPER = '#fdfbf4';
/** Flush pending stroke points to the server at most this often. */
const FLUSH_MS = 120;
/** Ignore pointer moves closer than this (canvas units) to the last point. */
const MIN_DIST = 2;

// Stroke ids only need to be unique per (seat, game); seeding from the clock
// keeps a reloaded tab from colliding with strokes it sent before the reload.
let strokeSeq = (Date.now() % 10_000_000) * 100;

function renderStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: ArtStroke[] | undefined,
  sizePx: number,
): void {
  ctx.clearRect(0, 0, sizePx, sizePx);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, sizePx, sizePx);
  if (!strokes) return;
  const k = sizePx / ART_CANVAS_UNITS;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of strokes) {
    const pts = s.pts;
    if (pts.length < 2) continue;
    ctx.strokeStyle = s.erase ? PAPER : s.color;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = Math.max(1, s.size * k);
    if (pts.length === 2) {
      ctx.beginPath();
      ctx.arc(pts[0]! * k, pts[1]! * k, Math.max(0.5, (s.size * k) / 2), 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(pts[0]! * k, pts[1]! * k);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i]! * k, pts[i + 1]! * k);
    ctx.stroke();
  }
}

interface LiveStroke {
  stroke: ArtStroke;
  /** How many pts values have been flushed to the server so far. */
  sent: number;
  lastFlush: number;
}

interface Props {
  cvKey: string;
  /** Enables pointer input and the toolbar. */
  canDraw?: boolean;
  /** Compact card rendering (gallery/vote grids): no toolbar, no input. */
  mini?: boolean;
}

/**
 * The shared drawing surface. Renders the stroke cache for `cvKey`; when
 * `canDraw`, captures mouse/touch/pen input, echoes it locally, and streams
 * point chunks to the server every {@link FLUSH_MS}.
 */
export default function ArtCanvas({ cvKey, canDraw = false, mini = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useStore((s) => s.artStrokes[cvKey]);
  const mySeat = useStore((s) => (s.game?.g === 'art' ? s.game.yourSeat : -1));
  const live = useRef<LiveStroke | null>(null);

  const [color, setColor] = useState<string>(ART_BRUSH_COLORS[0]);
  const [size, setSize] = useState<number>(ART_BRUSH_SIZES[1]);
  const [eraser, setEraser] = useState(false);

  const myStrokes = (strokes ?? []).filter((s) => s.seat === mySeat);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    renderStrokes(ctx, useStore.getState().artStrokes[cvKey], canvas.width);
  }, [cvKey]);

  // Keep the backing store square and crisp on resize / dpi changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fit = () => {
      const px = Math.max(1, Math.round(canvas.clientWidth * (window.devicePixelRatio || 1)));
      if (canvas.width !== px) {
        canvas.width = px;
        canvas.height = px;
      }
      redraw();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [redraw]);

  useEffect(redraw, [strokes, redraw]);

  // ── input ─────────────────────────────────────────────────────────────────

  function toUnits(e: React.PointerEvent): [number, number] {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * ART_CANVAS_UNITS;
    const y = ((e.clientY - rect.top) / rect.height) * ART_CANVAS_UNITS;
    return [
      Math.max(0, Math.min(ART_CANVAS_UNITS, Math.round(x))),
      Math.max(0, Math.min(ART_CANVAS_UNITS, Math.round(y))),
    ];
  }

  function flush(force = false): void {
    const cur = live.current;
    if (!cur) return;
    const now = performance.now();
    if (!force && now - cur.lastFlush < FLUSH_MS) return;
    const pending = cur.stroke.pts.slice(cur.sent);
    if (pending.length === 0) return;
    cur.sent += pending.length;
    cur.lastFlush = now;
    void sendAction({
      t: 'stroke',
      cv: cvKey,
      id: cur.stroke.id,
      color: cur.stroke.color,
      size: cur.stroke.size,
      ...(cur.stroke.erase ? { erase: true } : {}),
      pts: pending,
    });
  }

  function echo(): void {
    const cur = live.current;
    if (!cur) return;
    useStore.getState().artStrokeDelta(cvKey, cur.stroke, 'replace');
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!canDraw || mySeat < 0 || live.current) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    const [x, y] = toUnits(e);
    live.current = {
      stroke: {
        seat: mySeat,
        id: ++strokeSeq,
        color,
        size,
        ...(eraser ? { erase: true } : {}),
        pts: [x, y],
      },
      sent: 0,
      lastFlush: 0,
    };
    echo();
  }

  function onPointerMove(e: React.PointerEvent) {
    const cur = live.current;
    if (!cur) return;
    e.preventDefault();
    const [x, y] = toUnits(e);
    const pts = cur.stroke.pts;
    const lx = pts[pts.length - 2]!;
    const ly = pts[pts.length - 1]!;
    if (Math.abs(x - lx) < MIN_DIST && Math.abs(y - ly) < MIN_DIST) return;
    pts.push(x, y);
    echo();
    flush();
  }

  function endStroke(e: React.PointerEvent) {
    if (!live.current) return;
    e.preventDefault();
    echo();
    flush(true);
    live.current = null;
  }

  // If drawing rights vanish mid-stroke (phase flip), commit what we have.
  useEffect(() => {
    if (!canDraw && live.current) {
      flush(true);
      live.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canDraw]);

  function undo(): void {
    const last = myStrokes[myStrokes.length - 1];
    if (!last) return;
    useStore.getState().artStrokeUndo(cvKey, mySeat, last.id);
    void sendAction({ t: 'strokeUndo', cv: cvKey, id: last.id });
  }

  function clear(): void {
    if (myStrokes.length === 0) return;
    useStore.getState().artStrokeClear(cvKey, mySeat);
    void sendAction({ t: 'strokeClear', cv: cvKey });
  }

  return (
    <div className={`art-canvas-wrap${mini ? ' mini' : ''}`}>
      <canvas
        ref={canvasRef}
        className={`art-canvas${canDraw ? ' drawable' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onLostPointerCapture={endStroke}
      />
      {canDraw && !mini && (
        <div className="art-tools">
          <div className="art-swatches">
            {ART_BRUSH_COLORS.map((c) => (
              <button
                key={c}
                className={`art-swatch${!eraser && color === c ? ' active' : ''}`}
                style={{ background: c }}
                title={c}
                onClick={() => {
                  setColor(c);
                  setEraser(false);
                }}
              />
            ))}
          </div>
          <div className="art-tool-row">
            {ART_BRUSH_SIZES.map((s) => (
              <button
                key={s}
                className={`art-size${size === s ? ' active' : ''}`}
                title={`Brush ${s}`}
                onClick={() => setSize(s)}
              >
                <span
                  className="art-size-dot"
                  style={{ width: 4 + s / 3, height: 4 + s / 3, background: eraser ? '#888' : color }}
                />
              </button>
            ))}
            <button
              className={`btn art-tool-btn${eraser ? ' active' : ''}`}
              onClick={() => setEraser((v) => !v)}
            >
              Eraser
            </button>
            <button className="btn art-tool-btn" disabled={myStrokes.length === 0} onClick={undo}>
              Undo
            </button>
            <button className="btn art-tool-btn" disabled={myStrokes.length === 0} onClick={clear}>
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
