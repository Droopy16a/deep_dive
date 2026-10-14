export type Position = { depth: number; distance: number };
// Collectibles kick upward; mines kick downward, with ground clearance.
export function flightPosition(from: Position, to: Position, t: number, bounce: boolean, mineDive = false) {
  const lift = bounce ? 12 : 0;
  const baseline = from.depth + (to.depth - from.depth) * t;
  const downKick = mineDive ? Math.min(12 * Math.sin(Math.PI * t), (100 - baseline) * .55) : 0;
  const depth = baseline - Math.sin(Math.PI * t) * lift + downKick;
  const slope = to.depth - from.depth - Math.cos(Math.PI * t) * Math.PI * lift;
  return { depth: Math.max(8, Math.min(100, depth)),
    distance: from.distance + (to.distance - from.distance) * t,
    pitch: mineDive ? (28 - 4 * t) * Math.min(1, Math.max(0, (100 - depth) / 12)) : Math.max(-19, Math.min(26, slope * .55)) };
}
