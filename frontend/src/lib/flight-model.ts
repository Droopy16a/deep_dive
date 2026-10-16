// Deterministic fixed-tick flight model. Units are simulation coordinates,
// independent of screen pixels. Values were checked against the public model;
// reference sprites, renderer and API code are not dependencies of this module.
export const flightRules = Object.freeze({
  gravity: 1, fallingSpeed: 60, risingSpeed: 110, pickupLift: -40,
  rocketPush: 20, launchSpeed: -78, forwardSpeed: -80, braking: 2,
  ceiling: -6000, collisionRadius: 220, shipHalfWidth: 1350,
  shipWrapAt: -2500, shipWrapTo: 4050, valueScale: 8192, maxMultiplier: 250,
});

export class FlightRandom {
  private first = 0;
  private second = 0;
  private linear = 0;
  constructor(seed:number) { this.seed(seed); }
  seed(seed:number) {
    if (!Number.isSafeInteger(seed)) throw new Error('Invalid flight seed');
    this.first = seed;
    this.second = seed * 213947 + 1238971;
    this.linear = seed * 7431 + 94823;
    this.draw();
  }
  draw(bound = Number.MAX_SAFE_INTEGER) {
    // Preserve JavaScript's signed shifts and remainder. Replacing these with
    // unsigned arithmetic or a mathematically exact LCG changes the field.
    let mixed = this.first;
    const saved = this.second;
    this.first = saved;
    mixed ^= mixed << 23;
    mixed ^= mixed >> 17;
    mixed ^= saved;
    mixed ^= saved >> 26;
    this.second = mixed;
    this.linear = (1103515245 * this.linear + 12345) % 2147483648;
    return (this.first + this.second + this.linear) % bound;
  }
}

export type FieldObject = {
  id:number; x:number; y:number; add:number; multiply:number;
  rocket:boolean; respawns:number; turnsRocketAt:number;
};
export type FieldContact = {
  tick:number; id:number; rocket:boolean; add:number; multiply:number;
  y:number; incomingVelocity:number; outgoingVelocity:number; value:number;
};
export type FlightLayout = 'reference' | 'dive';

export function contactVelocity(y:number, velocity:number, rocket:boolean) {
  const liftLimit = Math.max(-velocity + 20, Math.floor((6000 + y + .5) / 64));
  const impulse = rocket ? flightRules.rocketPush : flightRules.pickupLift;
  const result = Math.max(-liftLimit, -flightRules.risingSpeed, velocity + impulse);
  return impulse < 0 ? Math.min(impulse, result) : result;
}

export function advanceVertical(y:number, velocity:number, ticks:number) {
  // Closed form of the exact discrete update; interpolation only fills the
  // space between fixed ticks and never changes a collision's tick state.
  const nearest=Math.round(ticks);
  if(Math.abs(ticks-nearest)<1e-7) ticks=nearest;
  const whole=Math.floor(ticks), fraction=ticks-whole;
  const accelerating=Math.min(whole,Math.max(0,Math.ceil(flightRules.fallingSpeed-velocity)));
  y+=accelerating*velocity+accelerating*(accelerating+1)/2+(whole-accelerating)*(velocity+accelerating);
  velocity+=accelerating;
  if(fraction>0) {velocity=velocity<flightRules.fallingSpeed?velocity+1:velocity;y+=velocity*fraction;}
  return {y,velocity};
}

export function createFlightOrientation() {
  let tick=0, angle=0, angularVelocity=0, phase=0;
  return {
    advanceTo(nextTick:number, velocityAt:(tick:number)=>number, onTick?:(tick:number,pitch:number)=>void, projectedAngleAt?:(tick:number)=>number) {
      while(tick<nextTick) {
        tick++;
        let target=projectedAngleAt?projectedAngleAt(tick):Math.atan2(velocityAt(tick),120);
        if(target>.46) {phase=(phase+.1)%(Math.PI*2);target+=Math.sin(phase)*.05;} else phase=0;
        angularVelocity+=(target-angle)*.08;
        angularVelocity*=.7;
        angle+=angularVelocity;
        onTick?.(tick,angle*180/Math.PI);
      }
      return angle*180/Math.PI;
    },
  };
}

export class FlightModel {
  readonly random:FlightRandom;
  readonly objects:FieldObject[];
  tick = 0;
  value:number = flightRules.valueScale;
  y = 0;
  vx:number = flightRules.forwardSpeed;
  vy:number = flightRules.launchSpeed;
  shipX = 0;
  distance = 0;
  finished = false;
  landed = false;

  constructor(seed:number, readonly layout:FlightLayout='reference') {
    this.random = new FlightRandom(seed);
    // A downward dive starts at the opposite side of the same vertical field.
    // This launch adaptation is explicit; the reference starts at y=0, vy=-78.
    if(layout==='dive') { this.y=flightRules.ceiling; this.vy=-flightRules.launchSpeed; }
    const definitions = [[1,1],[1,1],[1,1],[2,1],[2,1],[5,1],[10,1],[0,2],[0,3],[0,4],[0,5],[0,.5]];
    this.objects = definitions.map(([add,multiply],id)=>({
      id,add,multiply,x:0,y:-1e6,rocket:false,respawns:0,turnsRocketAt:id===11?0:id+1,
    }));
    // Each placement observes objects already placed, in the original order.
    for(const object of this.objects) this.respawn(object);
  }

  private respawn(object:FieldObject) {
    object.x=this.random.draw(2000+object.add*400+object.multiply*2000)+4000;
    object.y=-this.random.draw(4000)-700;
    while(this.objects.some(other=>other!==object && Math.abs(other.x-object.x)<300 && Math.abs(other.y-object.y)<450)) {
      object.y-=200;
    }
  }

  step():FieldContact[] {
    if(this.finished) return [];
    this.tick++;
    this.shipX+=this.vx;
    this.distance-=this.vx;
    if(this.shipX<flightRules.shipWrapAt) this.shipX=flightRules.shipWrapTo;
    if(this.landed) {
      if(this.shipX>-flightRules.shipHalfWidth) {
        if(this.vx) this.vx+=flightRules.braking;
        if(this.vx===0) this.finished=true;
      } else { this.landed=false; this.finished=true; }
    } else {
      if(this.vy<flightRules.fallingSpeed) this.vy+=flightRules.gravity;
      this.y+=this.vy;
      if(this.y>=0) {
        if(this.shipX>-flightRules.shipHalfWidth && this.shipX<flightRules.shipHalfWidth) {
          this.landed=true; this.vy=0; this.y=0;
        } else this.finished=true;
        if(this.vx) this.vx+=flightRules.braking;
      }
    }
    const contacts:FieldContact[]=[];
    for(const object of this.objects) {
      object.x+=this.vx;
      if(object.x>0) continue;
      if(Math.abs(this.y-object.y)<=flightRules.collisionRadius) {
        const rocket=object.rocket || object.multiply<1;
        const incomingVelocity=this.vy;
        if(rocket) this.value=Math.max(0,this.value-Math.max(1,Math.floor(this.value*.5)));
        else this.value=(this.value+object.add*flightRules.valueScale)*object.multiply;
        this.value=Math.min(flightRules.maxMultiplier*flightRules.valueScale,this.value);
        this.vy=contactVelocity(this.y,this.vy,rocket);
        contacts.push({tick:this.tick,id:object.id,rocket,add:object.add,multiply:object.multiply,
          y:this.y,incomingVelocity,outgoingVelocity:this.vy,value:this.value});
      }
      object.respawns++;
      if(object.respawns===object.turnsRocketAt) object.rocket=true;
      this.respawn(object);
    }
    return contacts;
  }

  get multiplier() { return this.value/flightRules.valueScale; }
  get resultMultiplier() { return this.landed ? this.multiplier : 0; }
}
