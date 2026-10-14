// Game-specific route contract. This does not add or change RGS endpoints.
export type Item = 'launch' | 'bubble' | 'treasure' | 'chest' | 'pearl' | 'mine' | 'wreck' | 'ground';
export type SceneryItem = 'bubble' | 'treasure' | 'chest' | 'pearl' | 'mine' | 'fish' | 'shell' | 'bottle';
export type SceneryObject = { id: string; item: SceneryItem; depth: number; distance: number; scale: number; rotation: number };
export type DiveStep = { index: number; type: 'diveStep'; depth: number; distance: number; item: Item; multiplier: number; scenery?: SceneryObject[] };
export type FinalWin = { index: number; type: 'finalWin'; amount: number };
export type BookEvent = DiveStep | FinalWin;
export type Book = { id: number; events: BookEvent[]; payoutMultiplier: number };
export const itemLabels: Record<Item, string> = { launch: 'DIVE!', bubble: '+1', treasure: '+3', chest: '×2', pearl: '×3', mine: '÷2', wreck: 'WRECK', ground: 'SEABED' };
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
  if (!Array.isArray(state) || state.length < 3) throw new Error('Missing route. Upload the matching v0.2 math files.');
  let value = 100, distance = -1;
  for (const [index, event] of state.entries()) {
    if (!event || event.index !== index) throw new Error('Invalid event sequence');
    if (index === state.length - 1) {
      if (event.type !== 'finalWin' || event.amount !== value) throw new Error('Final payout does not match the route');
    } else {
      if (event.type !== 'diveStep' || typeof event.item !== 'string' || !Object.hasOwn(itemLabels, event.item) || !Number.isFinite(event.depth) ||
          event.depth < 0 || event.depth > 100 || !Number.isFinite(event.distance) || event.distance <= distance) throw new Error('Invalid dive route');
      if (index === 0 && (event.item !== 'launch' || event.multiplier !== 100 || event.distance !== 0)) throw new Error('Invalid launch');
      if (index === 0 && event.scenery !== undefined) {
        if (!Array.isArray(event.scenery) || !event.scenery.every((object: SceneryObject) => object &&
          typeof object.id === 'string' && ['bubble','treasure','chest','pearl','mine','fish','shell','bottle'].includes(object.item) &&
          Number.isFinite(object.distance) && Number.isFinite(object.depth) && object.depth >= 0 && object.depth < 100 &&
          Number.isFinite(object.scale) && object.scale >= .5 && object.scale <= 1.5 &&
          Number.isFinite(object.rotation))) throw new Error('Invalid scenery field');
      }
      const terminal = index === state.length - 2;
      if (terminal !== (event.item === 'wreck' || event.item === 'ground') || terminal !== (event.depth === 100)) throw new Error('A route must finish on ground contact');
      value = applyItem(value, event.item);
      if (!Number.isSafeInteger(event.multiplier) || event.multiplier !== value) throw new Error('Encounter payout mismatch');
      distance = event.distance;
    }
  }
  if (state.at(-2).item !== (value === 0 ? 'ground' : 'wreck')) throw new Error('Ground result does not match the payout');
  return state as BookEvent[];
}
