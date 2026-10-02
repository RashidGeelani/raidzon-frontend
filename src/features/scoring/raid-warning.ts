import { useEffect, useRef } from 'react';

/** The raid timer turns red and warns once at this many milliseconds left. */
export const RAID_WARNING_MS = 10_000;

export function raidWarning(remainingMs: number, raiding: boolean) {
  return raiding && remainingMs <= RAID_WARNING_MS;
}

let audio: AudioContext | null = null;
function context() {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  audio ??= new Ctor();
  return audio;
}

/** Call from a tap so mobile browsers allow sound later in the raid. */
export function unlockRaidAudio() {
  try {
    void context()?.resume();
  } catch {
    /* sound not available */
  }
}

/** Two short beeps plus a buzz where the phone supports vibration. */
export function playRaidWarning() {
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    /* vibration not available */
  }
  try {
    const ctx = context();
    if (!ctx) return;
    void ctx.resume();
    const start = ctx.currentTime + 0.01;
    for (const offset of [0, 0.25]) {
      const tone = ctx.createOscillator();
      const gain = ctx.createGain();
      tone.type = 'square';
      tone.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.25, start + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.18);
      tone.connect(gain).connect(ctx.destination);
      tone.start(start + offset);
      tone.stop(start + offset + 0.2);
    }
  } catch {
    /* sound not available */
  }
}

/**
 * Warns once per raid when its clock crosses 10 seconds left. A raid that is already under
 * 10 seconds when first seen (reload, reconnect) does not warn.
 */
export function raidWarningTracker(warn: () => void) {
  let key: string | null = null;
  let above = false;
  let fired = false;
  return (raidKey: string | null, remainingMs: number) => {
    if (raidKey !== key) {
      key = raidKey;
      above = remainingMs > RAID_WARNING_MS;
      fired = false;
      return;
    }
    if (!raidKey || fired) return;
    if (remainingMs > RAID_WARNING_MS) { above = true; return; }
    if (above && remainingMs > 0) {
      fired = true;
      warn();
    }
  };
}

export function useRaidWarning(raidKey: string | null, remainingMs: number) {
  const track = useRef<ReturnType<typeof raidWarningTracker> | null>(null);
  track.current ??= raidWarningTracker(playRaidWarning);
  useEffect(() => { track.current!(raidKey, remainingMs); }, [raidKey, remainingMs]);
}
