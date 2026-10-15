export type WakeSample = { distance: number; depth: number; pitch: number; time: number };
export type WakeViewport = { width: number; height: number; subWidth: number; distance: number; targetDepth?: number; camera?: number };

// Historical stern positions live in world space. Only the camera offset moves
// old points; the submarine's current tilt never rotates the entire trail.
export function buildWake(history: WakeSample[], view: WakeViewport) {
  const newest = history.at(-1);
  const points = history.slice(-128).filter(sample => newest && newest.time - sample.time <= 1400
    && view.distance - sample.distance <= 100).map(sample => {
    const angle = sample.pitch * Math.PI / 180;
    const stern = -67 * view.subWidth / 420;
    return {
      x: view.width * .32 + view.subWidth * (160 / 420 - .38)
        + (sample.distance - view.distance) * view.width * .007 + stern * Math.cos(angle),
      y: view.height * (.364 + sample.depth * (view.targetDepth ?? 100) / 100 * .012 - (view.camera ?? 0))
        - view.subWidth * sample.depth / 100 * 46 / 420 + stern * Math.sin(angle),
      time: sample.time,
    };
  });
  let path = points.length ? `M${points[0].x},${points[0].y}` : '';
  for (let index = 1; index < points.length - 1; index++) {
    const point = points[index], next = points[index + 1];
    path += `Q${point.x},${point.y} ${(point.x + next.x) / 2},${(point.y + next.y) / 2}`;
  }
  if (points.length > 1) path += `L${points.at(-1)!.x},${points.at(-1)!.y}`;
  const bubbles = points.filter((_, index) => index % 4 === 0).map(point => {
    const age = (newest!.time - point.time) / 1400;
    return { x: point.x, y: point.y - age * 5, radius: 1.4 + age * 2.4,
      opacity: Math.max(0, .65 * (1 - age)) };
  });
  return { path, points, bubbles };
}
