/**
 * Time source for scoring and the scorer's clocks. It never runs backwards: if the phone's clock is
 * corrected backwards mid-match (e.g. automatic time sync), raid and half timers keep counting
 * instead of freezing until the wall clock catches up with the times already recorded.
 * While the wall clock is right it is used as is (it also keeps counting while the phone sleeps).
 */
let base = Date.now();
let perf0 = typeof performance === 'undefined' ? 0 : performance.now();

const monotonic = () => base + ((typeof performance === 'undefined' ? 0 : performance.now()) - perf0);

export function matchNow(): number {
  return Math.floor(Math.max(Date.now(), monotonic()));
}

/** Make sure the clock is not behind a time that was already recorded (e.g. after a reload). */
export function notBefore(time: number) {
  if (Number.isFinite(time) && time > matchNow()) {
    base = time;
    perf0 = typeof performance === 'undefined' ? 0 : performance.now();
  }
}
