export type Physics = {version: number; gravity: number; drag: number; horizontalSpeed: number};
export type FlightStep = {depth:number;distance:number;time:number;velocity:number;item:string;targetDepth?:number;physics?:Physics};
export const impulses: Record<string,number> = {bubble:32,treasure:44,chest:70,pearl:56};

// Analytic gravity + water drag. This function deliberately has no destination.
export function integrate(depth:number, velocity:number, seconds:number, physics:Physics) {
  const terminal=physics.gravity/physics.drag, decay=Math.exp(-physics.drag*seconds);
  return {depth:depth+terminal*seconds+(velocity-terminal)*(1-decay)/physics.drag,
    velocity:terminal+(velocity-terminal)*decay};
}
export function impact(depth:number, velocity:number, item:string, gravity:number) {
  if(item==='mine') return Math.max(18,velocity+10);
  if(impulses[item]!==undefined) return Math.max(-Math.sqrt(2*gravity*Math.max(0,depth-1))*.98,Math.min(-20,velocity-impulses[item]));
  return velocity;
}
export function positionAtDistance(steps:FlightStep[], distance:number) {
  const launch=steps[0], physics=launch.physics!, target=launch.targetDepth!;
  distance=Math.max(0,Math.min(steps.at(-1)!.distance,distance));
  let before=launch;
  for(const step of steps.slice(1)) {if(step.distance>distance)break;before=step;}
  const seconds=(distance-before.distance)/physics.horizontalSpeed;
  const state=integrate(before.depth*target/100,before.velocity,seconds,physics);
  // Tilt follows physical velocity; it is never aimed at an upcoming item.
  const slope=state.velocity*.012/(physics.horizontalSpeed*.007);
  return {depth:state.depth*100/target,distance,velocity:state.velocity,
    pitch:Math.max(-24,Math.min(32,Math.atan(slope)*180/Math.PI))};
}
export function sampleFlight(steps:FlightStep[], elapsed:number, duration:number) {
  // Live playback speeds change time only; no per-contact ease or braking.
  return positionAtDistance(steps,steps.at(-1)!.distance*Math.max(0,Math.min(1,elapsed/duration)));
}
// Replay at a constant rate, capped to keep short, dense Easy books readable.
// This is a whole-round time scale, never a per-contact ease or steering force.
export const flightDuration = (steps:FlightStep[]) => steps.at(-1)!.time*1000*Math.max(1,steps[0].physics!.horizontalSpeed/350);
