import { integrate, impact, type Physics } from './flight';
// Game-specific route contract. This does not add or change RGS endpoints.
export type Item = 'launch' | 'bubble' | 'treasure' | 'chest' | 'pearl' | 'mine' | 'ground';
export type SceneryItem = 'bubble' | 'treasure' | 'chest' | 'pearl' | 'mine' | 'fish' | 'shell' | 'bottle';
export type SceneryObject = { id: string; item: SceneryItem; depth: number; distance: number; scale: number; rotation: number;spawnDistance?:number;despawnDistance?:number };
export type DiveStep = { index: number; type: 'diveStep'; depth: number; distance: number; item: Item; multiplier: number; scenery?: SceneryObject[]; targetDepth?: number; landingBonus?: number; time: number; velocity: number; physics?: Physics;touchdownTime?:number;touchdownDistance?:number;fieldSeed?:number };
export type FinalWin = { index: number; type: 'finalWin'; amount: number };
export type BookEvent = DiveStep | FinalWin;
export type Book = { id: number; events: BookEvent[]; payoutMultiplier: number; selectionWeight: number };
export const itemLabels: Record<Item, string> = { launch: 'DIVE!', bubble: '+1', treasure: '+3', chest: '×2', pearl: '×3', mine: '÷2', ground: 'SEABED' };
export function applyItem(value: number, item: Item): number {
  switch (item) {
    case 'bubble': return value + 100;
    case 'treasure': return value + 300;
    case 'chest': return value * 2;
    case 'pearl': return value * 3;
    case 'mine': return Math.floor(value / 2);
    default: return value;
  }
}
export function readEvents(state: unknown): BookEvent[] {
  if (!Array.isArray(state) || state.length < 3) throw new Error('Missing route. Upload the matching depth-mode math files.');
  const depth = state[0]?.targetDepth, bonus = state[0]?.landingBonus;
  if (![100, 300, 600].includes(depth) || bonus !== depth / 100) throw new Error('Invalid target depth');
  const physics = state[0]?.physics;
  const native=physics?.version===3;
  const validNativeScale=physics?.fieldHeight===undefined ? physics?.verticalScale===depth/6000 :
    physics.fieldHeight===depth*60 && physics.verticalScale===1/60;
  if (!physics || (native ? physics.gravity!==1 || physics.drag!==0 || physics.horizontalSpeed!==120 || !validNativeScale : physics.version!==2 || physics.gravity!==18 || physics.drag!==.45) ||
      !Number.isFinite(physics.horizontalSpeed) || physics.horizontalSpeed<=0) throw new Error('Upload matching physics math and frontend');
  let value = 100, distance = -1;
  for (const [index, event] of state.entries()) {
    if (!event || event.index !== index) throw new Error('Invalid event sequence');
    if (index === state.length - 1) {
      if (event.type !== 'finalWin' || event.amount !== value) throw new Error('Final payout does not match the route');
    } else {
      if (event.type !== 'diveStep' || !Object.hasOwn(itemLabels, event.item) || !Number.isFinite(event.depth) ||
          event.depth < 0 || event.depth > 100 || !Number.isFinite(event.distance) || event.distance <= distance) throw new Error('Invalid dive route');
      if (index === 0 && (event.item !== 'launch' || event.multiplier !== 100 || event.distance !== 0 || event.depth !== 0)) throw new Error('Invalid launch');
      if (index === 0 && event.scenery !== undefined) {
        if (!Array.isArray(event.scenery) || !event.scenery.every((object: SceneryObject) => object &&
          typeof object.id === 'string' && ['bubble','treasure','chest','pearl','mine','fish','shell','bottle'].includes(object.item) &&
          Number.isFinite(object.distance) && Number.isFinite(object.depth) && object.depth >= 0 && object.depth < 100 &&
          Number.isFinite(object.scale) && object.scale >= .5 && object.scale <= 1.5 &&
          Number.isFinite(object.rotation) && (object.spawnDistance===undefined && object.despawnDistance===undefined ||
          Number.isFinite(object.spawnDistance) && Number.isFinite(object.despawnDistance) && object.spawnDistance!>=0 && object.despawnDistance!>object.spawnDistance!))) throw new Error('Invalid scenery field');
      }
      if (!Number.isFinite(event.time) || !Number.isFinite(event.velocity) || event.time<0 ||
          (native && event.item==='ground' && !Number.isFinite(event.touchdownDistance)) ||
          Math.abs(event.distance-(native && event.item==='ground'?event.touchdownDistance+39:event.time*physics.horizontalSpeed))>1e-6 ||
          (native && Math.abs(event.time*60-Math.round(event.time*60))>1e-6)) throw new Error('Invalid physical timeline');
      if(index===0 && (event.time!==0 || event.velocity!==(native?78:26))) throw new Error('Invalid physical launch');
      if(index>0) {
        const before=state[index-1], dt=event.time-before.time;
        if(dt<=0) throw new Error('Invalid physical timeline');
        const incoming=integrate(before.depth*depth/100,before.velocity,dt,physics);
        if(Math.abs(incoming.depth-event.depth*depth/100)>1e-6) throw new Error('Contact is outside physical trajectory');
        const outgoing=event.item==='ground'?0:impact(incoming.depth,incoming.velocity,event.item,physics);
        if(Math.abs(outgoing-event.velocity)>1e-6) throw new Error('Invalid contact impulse');
      }
      const terminal = index === state.length - 2;
      if (event.item === 'ground') {
        if (!terminal || event.depth !== 100 || event.landingBonus !== bonus) throw new Error('Invalid ground contact or landing bonus');
        if(native) {
          if(!Number.isFinite(event.touchdownTime) || event.touchdownTime<=state[index-1].time ||
            Math.abs(event.touchdownTime*60-Math.round(event.touchdownTime*60))>1e-6 ||
            Math.abs(event.time-event.touchdownTime-39/60)>1e-8 || Math.abs(event.touchdownDistance-event.touchdownTime*120)>1e-6)throw new Error('Invalid touchdown or braking');
          const before=state[index-1], dt=event.touchdownTime-before.time;
          if(integrate(before.depth*depth/100,before.velocity,dt,physics).depth<depth-1e-8 ||
             integrate(before.depth*depth/100,before.velocity,dt-1/60,physics).depth>=depth)throw new Error('Invalid first floor contact');
        }
        if (value === 0 && !native && (state[index - 1]?.item !== 'mine' ||
            (100 - state[index - 1].depth) * depth / 100 > 12.01)) throw new Error('Zero ground contact requires a nearby zero mine');
        value *= bonus;
      } else {
        if (event.depth === 100) throw new Error('Premature ground contact');
        value = applyItem(value,event.item);
        const nearGroundFinish = index === state.length - 3 && state[index + 1]?.item === 'ground'
          && (native || (100 - event.depth) * depth / 100 <= 12.01);
        if (value === 0 && (event.item !== 'mine' || (!terminal && !nearGroundFinish))) throw new Error('Round must stop at the first zero mine');
      }
      if (!Number.isSafeInteger(event.multiplier) || event.multiplier !== value) throw new Error('Encounter payout mismatch');
      distance = event.distance;
    }
  }
  const last = state.at(-2);
  if (value === 0 ? !['mine','ground'].includes(last.item) : last.item !== 'ground') throw new Error('Invalid dive ending');
  return state as BookEvent[];
}
