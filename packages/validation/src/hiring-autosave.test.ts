import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTOSAVE_DELAY_MS, createAutosave, type AutosaveState } from './index';

/**
 * A save whose promise the test resolves by hand, so "while a save is in flight" is a
 * state the test controls rather than one it races.
 */
function deferredSaves() {
  const calls: string[] = [];
  let settle: { resolve: () => void; reject: (error: Error) => void } | null = null;

  const save = (value: string): Promise<void> => {
    calls.push(value);
    return new Promise<void>((resolve, reject) => {
      settle = { resolve, reject };
    });
  };

  return {
    calls,
    save,
    /** Completes the in-flight save and lets its continuation run. */
    async resolve(): Promise<void> {
      settle!.resolve();
      settle = null;
      await Promise.resolve();
      await Promise.resolve();
    },
    async reject(): Promise<void> {
      settle!.reject(new Error('save failed'));
      settle = null;
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

describe('createAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** TC-H04-UNIT-02 — autosave debounces and coalesces. */
  it('fires nothing during a burst, then exactly one save after the pause', async () => {
    const saves = deferredSaves();
    const autosave = createAutosave<string>({ save: saves.save });
    autosave.reset('');

    // Five seconds of typing, no gap longer than 500 ms.
    for (let elapsed = 0; elapsed < 5000; elapsed += 500) {
      autosave.change(`notes ${elapsed}`);
      await vi.advanceTimersByTimeAsync(500);
    }
    expect(saves.calls).toEqual([]);
    expect(autosave.state()).toBe('pending');

    // Stop, and wait the two seconds.
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(saves.calls).toEqual(['notes 4500']);
    expect(autosave.state()).toBe('saving');

    // Typing again while that save is in flight neither interrupts it nor races it.
    autosave.change('notes 4500 and more');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(saves.calls).toEqual(['notes 4500']);

    // Keystrokes since are coalesced into the one save that follows.
    await saves.resolve();
    expect(saves.calls).toEqual(['notes 4500', 'notes 4500 and more']);
  });

  it('coalesces a whole burst arriving mid-save into a single following write', async () => {
    const saves = deferredSaves();
    const autosave = createAutosave<string>({ save: saves.save });
    autosave.reset('');

    autosave.change('a');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(saves.calls).toEqual(['a']);

    for (const value of ['ab', 'abc', 'abcd']) {
      autosave.change(value);
      await vi.advanceTimersByTimeAsync(500);
    }
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    await saves.resolve();

    expect(saves.calls).toEqual(['a', 'abcd']);
  });

  it('stops the loop on a failure and resumes only on a retry', async () => {
    const saves = deferredSaves();
    const states: AutosaveState[] = [];
    const autosave = createAutosave<string>({
      save: saves.save,
      onStateChange: (state) => states.push(state),
    });
    autosave.reset('');

    autosave.change('first');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    await saves.reject();

    expect(autosave.state()).toBe('failed');
    // A failing endpoint is not retried every two seconds for the length of an
    // interview: nothing more goes out until the member asks for it.
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 10);
    expect(saves.calls).toEqual(['first']);

    const retry = autosave.retry();
    expect(saves.calls).toEqual(['first', 'first']);
    await saves.resolve();
    await retry;

    expect(autosave.state()).toBe('saved');
    expect(autosave.isDirty()).toBe(false);
    expect(states).toContain('failed');
  });

  it('resumes the loop when the member edits again after a failure', async () => {
    const saves = deferredSaves();
    const autosave = createAutosave<string>({ save: saves.save });
    autosave.reset('');

    autosave.change('first');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    await saves.reject();
    expect(autosave.state()).toBe('failed');

    autosave.change('first, edited');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);

    expect(saves.calls).toEqual(['first', 'first, edited']);
  });

  it('flushes immediately on an explicit save and cancels the countdown', async () => {
    const saves = deferredSaves();
    const autosave = createAutosave<string>({ save: saves.save });
    autosave.reset('');

    autosave.change('typed');
    const flushed = autosave.flush();
    expect(saves.calls).toEqual(['typed']);

    await saves.resolve();
    await flushed;

    // The pending countdown was cancelled by the flush, not left to fire a second write.
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
    expect(saves.calls).toEqual(['typed']);
  });

  it('writes nothing when the text is unchanged', async () => {
    const saves = deferredSaves();
    const autosave = createAutosave<string>({ save: saves.save });
    autosave.reset('as stored');

    autosave.change('as stored');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
    await autosave.flush();

    expect(saves.calls).toEqual([]);
  });
});
