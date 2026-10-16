import {advanceVertical,contactVelocity} from './flight-model';
export type Physics = {version: number; gravity: number; drag: number; horizontalSpeed: number;verticalScale?:number};
export type FlightStep = {depth:number;distance:number;time:number;velocity:number;item:string;targetDepth?:number;physics?:Physics;touchdownTime?:number;touchdownDistance?:number};
export type FlightView = {width:number;height:number;subWidth:number};
export function flightPitch(velocity:number, horizontalSpeed:number, targetDepth:number, view:FlightView={width:1200,height:740,subWidth:340}, limited=true) {
  // Use the same pixel scales and hull offset as Ocean and the wake. Ratios
  // of percentages alone over-rotate the vessel, especially on tall screens.
  const verticalScale = view.height*.012-view.subWidth*46/(420*targetDepth);
  const angle=Math.atan2(velocity*verticalScale,horizontalSpeed*view.width*.007)*180/Math.PI;
  return limited?Math.max(-24,Math.min(32,angle)):angle;
}
export const impulses: Record<string,number> = {bubble:32,treasure:44,chest:70,pearl:56};

// Native tick physics, with analytic drag retained for version 2 replays.
// Neither branch aims at a future collectible.
export function integrate(depth:number, velocity:number, seconds:number, physics:Physics) {
  if(physics.version===3) {
    const scale=physics.verticalScale!, ticks=seconds*60;
    const state=advanceVertical(depth/scale-6000,velocity,ticks);
    // At touchdown the native model clamps to the floor. Interpolate toward
    // that clamped tick so rendering cannot overshoot or stick below the floor.
    const whole=Math.floor(ticks+1e-8), fraction=ticks-whole;
    if(fraction>1e-8) {
      const before=advanceVertical(depth/scale-6000,velocity,whole);
      const after=advanceVertical(before.y,before.velocity,1);
      if(before.y<0 && after.y>=0)return {depth:(before.y*(1-fraction)+6000)*scale,velocity:before.velocity};
    }
    if(state.y>=0)return {depth:6000*scale,velocity:0};
    return {depth:(state.y+6000)*scale,velocity:state.velocity};
  }
  const terminal=physics.gravity/physics.drag, decay=Math.exp(-physics.drag*seconds);
  return {depth:depth+terminal*seconds+(velocity-terminal)*(1-decay)/physics.drag,
    velocity:terminal+(velocity-terminal)*decay};
}
export function impact(depth:number, velocity:number, item:string, specification:number|Physics) {
  if(typeof specification!=='number' && specification.version===3) {
    return item==='mine'||impulses[item]!==undefined ? contactVelocity(depth/specification.verticalScale!-6000,velocity,item==='mine') : velocity;
  }
  const gravity=typeof specification==='number'?specification:specification.gravity;
  if(item==='mine') return Math.max(18,velocity+10);
  if(impulses[item]!==undefined) return Math.max(-Math.sqrt(2*gravity*Math.max(0,depth-1))*.98,Math.min(-20,velocity-impulses[item]));
  return velocity;
}
export function positionAtDistance(steps:FlightStep[], distance:number) {
  const launch=steps[0], physics=launch.physics!, target=launch.targetDepth!;
  distance=Math.max(0,Math.min(steps.at(-1)!.distance,distance));
  let before=launch;
  for(const step of steps.slice(1)) {if(step.distance>distance)break;before=step;}
  let time=distance/physics.horizontalSpeed;
  const end=steps.at(-1)!;
  if(physics.version===3 && end.touchdownDistance!==undefined && distance>end.touchdownDistance) {
    let low=0,high=39;
    for(let i=0;i<45;i++) {const middle=(low+high)/2;if(brakingDistance(middle)<distance-end.touchdownDistance)low=middle;else high=middle;}
    time=end.touchdownTime!+(low+high)/120;
  }
  const seconds=physics.version===3?Math.max(0,time-before.time):(distance-before.distance)/physics.horizontalSpeed;
  const state=integrate(before.depth*target/100,before.velocity,seconds,physics);
  // Tilt follows physical velocity; it is never aimed at an upcoming item.
  const velocity=state.velocity*(physics.version===3?physics.verticalScale!*60:1);
  return {depth:state.depth*100/target,distance,velocity,nativeVelocity:state.velocity,
    grounded:physics.version===3?time>=end.touchdownTime!-1e-8:state.depth>=target,
    pitch:physics.version===3?Math.atan2(state.velocity,120)*180/Math.PI:flightPitch(velocity,physics.horizontalSpeed,target)};
}
function brakingDistance(ticks:number) {
  const whole=Math.floor(ticks), fraction=ticks-whole;
  return (80*whole-whole*(whole+1)+fraction*Math.max(0,78-2*whole))/40;
}
export function sampleFlight(steps:FlightStep[], elapsed:number, duration:number) {
  if(steps[0].physics!.version===3) {
    const end=steps.at(-1)!, time=end.time*Math.max(0,Math.min(1,elapsed/duration));
    const distance=time<=end.touchdownTime!?time*120:end.touchdownDistance!+brakingDistance(Math.min(39,(time-end.touchdownTime!)*60));
    return positionAtDistance(steps,distance);
  }
  // Live playback speeds change time only; no per-contact ease or braking.
  return positionAtDistance(steps,steps.at(-1)!.distance*Math.max(0,Math.min(1,elapsed/duration)));
}
// Replay at a constant rate, capped to keep short, dense Easy books readable.
// This is a whole-round time scale, never a per-contact ease or steering force.
export const flightDuration = (steps:FlightStep[]) => steps.at(-1)!.time*1000*Math.max(1,steps[0].physics!.horizontalSpeed/350);
