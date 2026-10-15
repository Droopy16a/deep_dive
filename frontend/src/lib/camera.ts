// Coordinates are fractions of viewport height. A metre keeps the same scale
// for every target depth; the camera stops before revealing below the seabed.
export const surfaceY = .364;
export const metresToScreen = .012;
export const worldY = (progress: number, targetDepth: number) => progress * targetDepth / 100 * metresToScreen;
export const cameraLimit = (targetDepth: number) => Math.max(0, targetDepth * metresToScreen - .48);
export function followCamera(current: number, progress: number, targetDepth: number, delta: number) {
  const y = worldY(progress, targetDepth), limit = cameraLimit(targetDepth);
  // A viewing window leaves rises/falls visible instead of tracking every bounce.
  const relative = y-current;
  const target = Math.max(0, Math.min(limit, relative>.32 ? y-.32 : relative<-.10 ? y+.10 : current));
  const eased = current + (target-current)*(1-Math.exp(-delta/300));
  // Bound lag in both directions during bounces, Turbo and throttled frames.
  return Math.max(0, Math.min(limit, y + .15, Math.max(eased, y - .45)));
}
