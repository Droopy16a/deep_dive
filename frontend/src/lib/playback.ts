const rateFor = (speed: number) => [1 / 2.25, 1 / 1.35, 1 / .65, 1 / .24][speed];

// Integrate virtual animation time; changing speed never repositions the round.
// Exact exponential integration makes the short speed blend frame-rate independent.
export function createPlaybackClock(duration: number, initialSpeed: number, native = false) {
  const rateAt=(speed:number)=>native?[.5,1,4,10][speed]:rateFor(speed);
  let elapsed = 0, rate = rateAt(initialSpeed);
  if (!(duration > 0) || !Number.isFinite(duration) || rate === undefined) throw new Error('Invalid playback clock');
  return {
    advance(delta: number, speed: number) {
      const target = rateAt(speed);
      if (!Number.isFinite(delta) || delta < 0 || target === undefined) throw new Error('Invalid playback advance');
      const start = elapsed, initialRate = rate;
      const at = (offset: number) => {
        const time = Math.max(0, Math.min(delta, offset));
        return Math.min(duration, start + target * time + (native?0:(initialRate - target) * 140 * (1 - Math.exp(-time / 140))));
      };
      elapsed = at(delta);
      rate = native?target:target + (initialRate - target) * Math.exp(-delta / 140);
      return {start, end: elapsed, at};
    },
  };
}
