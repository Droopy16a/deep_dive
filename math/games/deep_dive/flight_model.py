"""Fixed-tick field model, shared behavior with frontend flight-model.ts.

Use floating-point LCG math and signed bit operations to preserve the selected
JavaScript generator's semantics. The reference application is not imported.
"""
from dataclasses import dataclass
import math


def signed32(value):
    value = int(value) & 0xFFFFFFFF
    return value - 0x100000000 if value >= 0x80000000 else value


class FlightRandom:
    def __init__(self, seed):
        self.first = float(seed)
        self.second = float(seed) * 213947.0 + 1238971.0
        self.linear = float(seed) * 7431.0 + 94823.0
        self.draw()

    def draw(self, bound=9007199254740991):
        mixed, saved = signed32(self.first), self.second
        self.first = saved
        mixed = signed32(mixed ^ signed32(mixed << 23))
        mixed = signed32(mixed ^ (mixed >> 17))
        mixed = signed32(mixed ^ signed32(saved))
        mixed = signed32(mixed ^ (signed32(saved) >> 26))
        self.second = mixed
        self.linear = math.fmod(1103515245.0 * self.linear + 12345.0, 2147483648.0)
        return math.fmod(self.first + self.second + self.linear, bound)


@dataclass
class FieldObject:
    id: int
    add: int
    multiply: float
    turns_rocket_at: int
    x: float = 0
    y: float = -1000000
    rocket: bool = False
    respawns: int = 0


def contact_velocity(y, velocity, rocket):
    lift_limit = max(-velocity + 20, math.floor((6000 + y + .5) / 64))
    impulse = 20 if rocket else -40
    result = max(-lift_limit, -110, velocity + impulse)
    return min(impulse, result) if impulse < 0 else result


def advance_vertical(y, velocity, ticks):
    nearest = round(ticks)
    if abs(ticks - nearest) < 1e-7:
        ticks = nearest
    whole = math.floor(ticks)
    fraction = ticks - whole
    accelerating = min(whole, max(0, math.ceil(60 - velocity)))
    y += accelerating * velocity + accelerating * (accelerating + 1) / 2 + (whole - accelerating) * (velocity + accelerating)
    velocity += accelerating
    if fraction > 0:
        velocity = velocity + 1 if velocity < 60 else velocity
        y += velocity * fraction
    return y, velocity


class FlightModel:
    def __init__(self, seed, layout="reference"):
        if layout not in ("reference", "dive"):
            raise ValueError("Invalid flight layout")
        self.random = FlightRandom(seed)
        self.tick, self.value = 0, 8192
        self.y, self.vx, self.vy = (0, -80, -78) if layout == "reference" else (-6000, -80, 78)
        self.ship_x, self.distance = 0, 0
        self.finished, self.landed = False, False
        definitions = [(1, 1), (1, 1), (1, 1), (2, 1), (2, 1), (5, 1), (10, 1),
                       (0, 2), (0, 3), (0, 4), (0, 5), (0, .5)]
        self.objects = [FieldObject(index, add, multiply, index + 1 if index < 11 else 0)
                        for index, (add, multiply) in enumerate(definitions)]
        for obj in self.objects:
            self.respawn(obj)

    def respawn(self, obj):
        obj.x = self.random.draw(2000 + obj.add * 400 + obj.multiply * 2000) + 4000
        obj.y = -self.random.draw(4000) - 700
        while any(other is not obj and abs(other.x - obj.x) < 300 and abs(other.y - obj.y) < 450
                  for other in self.objects):
            obj.y -= 200

    def step(self):
        if self.finished:
            return []
        self.tick += 1
        self.ship_x += self.vx
        self.distance -= self.vx
        if self.ship_x < -2500:
            self.ship_x = 4050
        if self.landed:
            if self.ship_x > -1350:
                if self.vx:
                    self.vx += 2
                if self.vx == 0:
                    self.finished = True
            else:
                self.landed, self.finished = False, True
        else:
            if self.vy < 60:
                self.vy += 1
            self.y += self.vy
            if self.y >= 0:
                if -1350 < self.ship_x < 1350:
                    self.landed, self.vy, self.y = True, 0, 0
                else:
                    self.finished = True
                if self.vx:
                    self.vx += 2
        contacts = []
        for obj in self.objects:
            obj.x += self.vx
            if obj.x > 0:
                continue
            if abs(self.y - obj.y) <= 220:
                rocket = obj.rocket or obj.multiply < 1
                incoming = self.vy
                if rocket:
                    self.value = max(0, self.value - max(1, math.floor(self.value * .5)))
                else:
                    self.value = (self.value + obj.add * 8192) * obj.multiply
                self.value = min(250 * 8192, self.value)
                self.vy = contact_velocity(self.y, self.vy, rocket)
                contacts.append({"tick": self.tick, "id": obj.id, "rocket": rocket,
                                 "add": obj.add, "multiply": obj.multiply, "y": self.y,
                                 "incomingVelocity": incoming, "outgoingVelocity": self.vy,
                                 "value": self.value})
            obj.respawns += 1
            if obj.respawns == obj.turns_rocket_at:
                obj.rocket = True
            self.respawn(obj)
        return contacts

    @property
    def result_multiplier(self):
        return self.value / 8192 if self.landed else 0

