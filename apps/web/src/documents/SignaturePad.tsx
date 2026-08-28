'use client';

import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { ENVELOPE_LIMITS } from '@devscribed/validation';
import { Button, Input, Tabs } from '@/ds';

export type SignatureMode = 'drawn' | 'typed';

/**
 * The signature control — requirement 22: drawn on a canvas and stored as a PNG data URI,
 * or typed as a name that is rendered into an image at completion.
 *
 * The canvas element itself is owned by the caller (through `canvasRef`) rather than by
 * this component, for one reason that the spec states outright: after a failed submit the
 * drawn signature must survive. Reading the pixels at submit time from a canvas that never
 * unmounts is what makes "re-signing after a network error" impossible, and it is why the
 * ink is not lifted into React state on every stroke.
 */
export function SignaturePad({
  mode,
  onModeChange,
  typedName,
  onTypedNameChange,
  canvasRef,
  disabled,
  error,
}: {
  mode: SignatureMode;
  onModeChange: (mode: SignatureMode) => void;
  typedName: string;
  onTypedNameChange: (name: string) => void;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  disabled: boolean;
  error?: string;
}) {
  const drawing = useRef(false);
  const sized = useRef(false);

  // Sized once from its own box and scaled for the device pixel ratio: a canvas whose
  // backing store is smaller than its CSS box produces a blurry signature, and a signature
  // is the one image on this page that has to be legible in a PDF a year from now.
  //
  // The "already sized" test is this ref and not `canvas.width`: an unsized canvas
  // reports the HTML default of 300×150, so a `canvas.width > 0` guard skips the sizing
  // every time. That left the backing store at 300×150 under a CSS box up to 720 px
  // wide, and because the drawing coordinates are CSS pixels, every stroke past x=300
  // landed outside the bitmap — a signature drawn on the right of the pad was silently
  // discarded and came back as "Please draw your signature".
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || sized.current) return;
    sized.current = true;
    const ratio = window.devicePixelRatio || 1;
    const box = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(box.width * ratio));
    canvas.height = Math.max(1, Math.round(box.height * ratio));
    const context = canvas.getContext('2d');
    if (!context) return;
    context.scale(ratio, ratio);
    context.lineWidth = 2;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#000000';
  }, [canvasRef]);

  function pointAt(event: ReactPointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  }

  function start(event: ReactPointerEvent<HTMLCanvasElement>): void {
    if (disabled) return;
    const context = canvasRef.current?.getContext('2d');
    if (!context) return;
    drawing.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const { x, y } = pointAt(event);
    context.beginPath();
    context.moveTo(x, y);
    // A tap with no drag is still ink: a dot has to count, or a short signature reads as
    // "please draw your signature" to someone who just drew one.
    context.lineTo(x + 0.01, y);
    context.stroke();
  }

  function move(event: ReactPointerEvent<HTMLCanvasElement>): void {
    if (!drawing.current || disabled) return;
    const context = canvasRef.current?.getContext('2d');
    if (!context) return;
    const { x, y } = pointAt(event);
    context.lineTo(x, y);
    context.stroke();
  }

  function end(): void {
    drawing.current = false;
  }

  /** Clears whichever signature the caller is currently looking at, not both. */
  function clear(): void {
    if (mode === 'typed') {
      onTypedNameChange('');
      return;
    }
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.restore();
  }

  return (
    <section
      data-testid="signing-signature"
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--sp-8)',
        background: 'var(--bg-panel)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--sp-6)',
          marginBottom: 'var(--sp-6)',
        }}
      >
        <div data-testid="signing-signature-mode" style={{ flex: 1 }}>
          <Tabs
            items={[
              { value: 'drawn', label: <span data-testid="signing-signature-mode-drawn">Draw</span> },
              { value: 'typed', label: <span data-testid="signing-signature-mode-typed">Type</span> },
            ]}
            value={mode}
            onChange={(next: string) => onModeChange(next as SignatureMode)}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-testid="signing-signature-clear-btn"
          onClick={clear}
        >
          Clear
        </Button>
      </div>

      {/*
        The canvas stays mounted in both modes. Switching to Type and back must not wipe
        what was drawn, and neither must a failed submit.
      */}
      <div style={{ display: mode === 'drawn' ? 'block' : 'none' }}>
        <canvas
          ref={canvasRef}
          data-testid="signing-signature-canvas"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
          style={{
            display: 'block',
            width: '100%',
            height: 160,
            border: `1.5px dashed ${error ? 'var(--error-500)' : 'var(--border-strong)'}`,
            borderRadius: 'var(--radius-lg)',
            background: 'var(--paper-0)',
            touchAction: 'none',
            cursor: disabled ? 'not-allowed' : 'crosshair',
          }}
        />
      </div>

      <div style={{ display: mode === 'typed' ? 'block' : 'none' }}>
        <Input
          label="Type your full name"
          value={typedName}
          disabled={disabled}
          maxLength={ENVELOPE_LIMITS.typedSignatureMax}
          data-testid="signing-signature-typed-input"
          onChange={(event) => onTypedNameChange(event.target.value)}
          wrapperStyle={{ gap: 0 }}
        />
        <div
          aria-hidden
          style={{
            marginTop: 'var(--sp-5)',
            minHeight: 64,
            display: 'flex',
            alignItems: 'center',
            padding: '0 var(--sp-6)',
            border: '1.5px dashed var(--border-strong)',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--paper-0)',
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            fontSize: 'var(--fs-27)',
            color: 'var(--char-ink)',
          }}
        >
          {typedName}
        </div>
      </div>

      {error && (
        <p
          data-testid="signing-signature-error"
          style={{ margin: 'var(--sp-4) 0 0', fontSize: 'var(--fs-13)', color: 'var(--error-500)' }}
        >
          {error}
        </p>
      )}
    </section>
  );
}
