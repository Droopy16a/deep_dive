"""Choose an outcome first; construct an exact, deterministic presentation route.

All values are hundredths of a multiplier. Mines round down at that precision.
This allows a finite sequence of mines to reach zero without a hidden override.
"""
from collections import deque
import random
import math
from flight_model import FlightModel, advance_vertical, contact_velocity

OPERATIONS = ("bubble", "treasure", "chest", "pearl", "mine")
SCENERY_ITEMS = (*OPERATIONS, "fish", "shell", "bottle")


GRAVITY = 18.0
DRAG = .45
IMPULSES = {"bubble": 32.0, "treasure": 44.0, "chest": 70.0, "pearl": 56.0}


def integrate(depth: float, velocity: float, seconds: float, physics=None) -> tuple[float, float]:
    """Native tick physics, or legacy analytic drag for version 2 replay checks."""
    if physics and physics["version"] == 3:
        scale, ticks = physics["verticalScale"], seconds * 60
        height = physics.get("fieldHeight", 6000)
        floor = height - 6000
        y, speed = advance_vertical(depth / scale - 6000, velocity, ticks)
        whole = math.floor(ticks + 1e-8)
        fraction = ticks - whole
        if fraction > 1e-8:
            before, before_speed = advance_vertical(depth / scale - 6000, velocity, whole)
            after, _ = advance_vertical(before, before_speed, 1)
            if before < floor <= after:
                return ((before - floor) * (1 - fraction) + height) * scale, before_speed
        return (height * scale, 0) if y >= floor else ((y + 6000) * scale, speed)
    terminal = GRAVITY / DRAG
    decay = math.exp(-DRAG * seconds)
    return (depth + terminal * seconds + (velocity-terminal)*(1-decay)/DRAG,
            terminal + (velocity-terminal)*decay)


def impact(depth: float, velocity: float, item: str, physics=None) -> float:
    if physics and physics["version"] == 3:
        native_y = depth / physics["verticalScale"] - 6000
        return contact_velocity(min(0, native_y) if "fieldHeight" in physics else native_y, velocity, item == "mine") if item in OPERATIONS else velocity
    if item == "mine":
        return max(18.0, velocity + 10.0)
    if item in IMPULSES:
        # Partial immersion limits the lift near the surface. At depth, the
        # same impulse changes momentum without resetting vertical speed.
        available_lift = math.sqrt(2*GRAVITY*max(0,depth-1))*.98
        return max(-available_lift, min(-20.0, velocity-IMPULSES[item]))
    return velocity


def descent_time(depth: float, velocity: float, target: float) -> float:
    low, high = 0.0, 1.0
    while integrate(depth,velocity,high)[0] < target:
        high *= 2
    for _ in range(60):
        middle = (low+high)/2
        if integrate(depth,velocity,middle)[0] < target:
            low = middle
        else:
            high = middle
    return (low+high)/2


def depth_at(events: list[dict], distance: float) -> float:
    """Replay physical state, never interpolate toward the next collectible."""
    launch = events[0]
    distance = max(0,min(distance,events[-1]["distance"]))
    before = launch
    for event in events[1:]:
        if event["distance"] > distance:
            break
        before = event
    seconds = (distance-before["distance"])/launch["physics"]["horizontalSpeed"]
    metres, _ = integrate(before["depth"]*launch["targetDepth"]/100, before["velocity"], seconds, launch["physics"])
    return metres*100/launch["targetDepth"]


def scenery_clear(events: list[dict], distance: float, depth: float) -> bool:
    # Sweep a horizontal hull-sized window, not just the contact point, so an
    # uncollected item cannot visibly pass through the moving submarine.
    return all(abs(depth_at(events, distance + offset) - depth) >= 7.2*100/events[0]["targetDepth"]
               for offset in range(-18, 19, 3))


def generate_scenery(events: list[dict], seed: int) -> list[dict]:
    rng = random.Random(seed ^ 0xD33F)
    end = events[-1]["distance"]
    objects = []
    if events[0]["physics"]["version"] == 3:
        field = FlightModel(seed)
        # Field placement and respawn are independent of collisions. Keep the
        # observer outside the field so this records the original seeded layout
        # without changing the authoritative payout-constrained trajectory.
        field.y, field.vy = -1000000, 0

        def remember(obj):
            depth = (obj.y + 6000) / 60
            distance = (field.distance + obj.x) / 40
            if not 0 <= depth < 92:
                return
            item = "mine" if obj.rocket or obj.multiply < 1 else "bubble" if obj.add == 1 else "treasure" if obj.add else "chest" if obj.multiply == 2 else "pearl"
            if not scenery_clear(events, distance, depth):
                return
            objects.append({"id": f"field-{seed}-{obj.id}-{obj.respawns}", "item": item,
                            "distance": distance, "depth": depth, "scale": 1, "rotation": 0,
                            "spawnDistance": field.distance / 40,
                            "despawnDistance": (field.distance + max(1, math.ceil(obj.x / 80)) * 80) / 40})

        for obj in field.objects:
            remember(obj)
        while field.distance / 40 <= end:
            previous = [obj.respawns for obj in field.objects]
            field.step()
            for obj, respawns in zip(field.objects, previous):
                if obj.respawns != respawns:
                    remember(obj)
    count = max(60, len(objects) + 35)
    for _ in range(count * 40):
        item = rng.choice(("fish", "shell", "bottle") if events[0]["physics"]["version"] == 3 else SCENERY_ITEMS)
        distance = round(rng.uniform(-40, end + 110), 2)
        depth = round(rng.uniform(0, 92), 2)
        if item in OPERATIONS and not scenery_clear(events, distance, depth):
            continue
        # Avoid a uniform grid and avoid visible piles of scenery.
        if any(abs(obj["distance"] - distance) < 11 and abs(obj["depth"] - depth) < 10 for obj in objects):
            continue
        objects.append({"id": f"scenery-{seed}-{len(objects)}",
                        "item": item,
                        "distance": round(distance, 2), "depth": round(depth, 2),
                        "scale": round(rng.uniform(.7, 1.1), 2),
                        "rotation": rng.randint(-20, 20)})
        if len(objects) == count:
            break
    return objects


def apply_item(value: int, item: str) -> int:
    if item == "bubble":
        return value + 100
    if item == "treasure":
        return value + 300
    if item == "chest":
        return value * 2
    if item == "pearl":
        return value * 3
    if item == "mine":
        return value // 2
    if item in ("launch", "ground"):
        return value
    raise ValueError(f"Unknown encounter: {item}")


def complete_path(start: int, target: int, rng: random.Random) -> list[str]:
    """Bounded breadth-first search; never patch the final payout afterwards."""
    prefix = []
    while start > max(12800, target * 3):
        prefix.append("mine")
        start = apply_item(start, "mine")
    order = list(OPERATIONS)
    rng.shuffle(order)
    queue = deque([start])
    parents = {start: None}
    while queue:
        value = queue.popleft()
        if value == target:
            path = []
            while parents[value] is not None:
                previous, item = parents[value]
                path.append(item)
                value = previous
            return prefix + path[::-1]
        for item in order:
            next_value = apply_item(value, item)
            if 0 < next_value <= max(12800, target * 3) and next_value not in parents:
                parents[next_value] = (value, item)
                queue.append(next_value)
    raise ValueError(f"Cannot construct exact route from {start} to {target}")


def generate_route(target: int, seed: int, target_depth: int = 100, landing_bonus: int = 1) -> list[dict]:
    if target % landing_bonus:
        raise ValueError("Payout cannot be represented by depth bonus")
    raw_target = target // landing_bonus
    rng = random.Random(seed)
    # A compact, varied opening avoids identical all-four-item introductions.
    items, value = [], 100
    for _ in range(rng.randint(3, 5)):
        choices = [item for item in OPERATIONS[:-1] if apply_item(value, item) <= 3000]
        item = rng.choice(choices or ["bubble"])
        items.append(item)
        value = apply_item(value, item)
    # Additional actual contacts, not decorative scenery. Solve the exact
    # outcome only after this varied middle section has applied its effects.
    for _ in range(rng.randint(2, 5) * (target_depth // 100)):
        choices = [item for item in OPERATIONS
                   if 300 <= apply_item(value, item) <= 5000 and item != items[-1]]
        item = rng.choice(choices or ["bubble"])
        items.append(item)
        value = apply_item(value, item)
    if raw_target == 0:
        if items[-1] == "mine":
            items.append("chest")
            value = apply_item(value, "chest")
        # Spread hazards through short clusters, with mathematically real
        # recoveries. Every cluster still reduces value; no long mine conveyor.
        while value:
            for _ in range(rng.randint(2, 4)):
                items.append("mine")
                value = apply_item(value, "mine")
                if value == 0:
                    break
            if value:
                items.append("chest")
                value = apply_item(value, "chest")
    else:
        items.extend(complete_path(value, raw_target, rng))

    # Money outcomes are intentionally unchanged. Their contacts are scheduled
    # on the recovered fixed-tick trajectory, without destination steering.
    # The reference's unrestricted field cannot replace this constrained book
    # generator while retaining every requested payout value and weight.
    # Every mode uses Easy's metres per tick. Depth extends the field rather
    # than amplifying gravity, launch speed or pickup impulses.
    height = target_depth * 60
    floor = height - 6000
    physics = {"version": 3, "gravity": 1, "drag": 0, "horizontalSpeed": 120,
               "verticalScale": 1 / 60, "fieldHeight": height}
    tick, y, velocity, value = 0, -6000, 78, 100
    events = [{"type": "diveStep", "item": "launch", "distance": 0, "time": 0,
               "depth": 0, "velocity": velocity, "multiplier": value,
               "targetDepth": target_depth, "landingBonus": landing_bonus, "physics": physics}]
    events[0]["fieldSeed"] = seed

    def floor_ticks(at_y, at_speed):
        low, high = 0, 256
        while advance_vertical(at_y, at_speed, high)[0] < floor:
            high *= 2
        while low + 1 < high:
            middle = (low + high) // 2
            if advance_vertical(at_y, at_speed, middle)[0] < floor:
                low = middle
            else:
                high = middle
        return high

    for index, item in enumerate(items):
        desired = rng.randint(30, 55) if index == 0 else rng.randint(*rng.choice([(6, 14), (18, 32), (42, 72)]))
        if item == "mine":
            desired = rng.randint(6, 24)
        if target_depth > 100:
            # Spread contacts through the deeper field, with Easy's motion
            # between them. Short hazard clusters retain their normal gaps.
            desired += (target_depth // 100 - 1) * (12 if item == "mine" else 24)
        candidates = []
        for gap in range(4, floor_ticks(y, velocity)):
            at_y, incoming = advance_vertical(y, velocity, gap)
            outgoing = contact_velocity(min(0, at_y), incoming, item == "mine")
            # Reject placements whose resulting rise would leave the ocean.
            # This chooses encounter timing; the force itself is never altered.
            crest = advance_vertical(at_y, outgoing, max(0, -outgoing))[0]
            if min(at_y, crest) < -5995:
                continue
            # Leave room for the next real hazard cluster, at four-tick spacing.
            probe_y, probe_speed, safe = at_y, outgoing, True
            for following in items[index + 1:]:
                probe_y, probe_speed = advance_vertical(probe_y, probe_speed, 4)
                if probe_y >= floor:
                    safe = False
                    break
                probe_speed = contact_velocity(min(0, probe_y), probe_speed, following == "mine")
            if safe:
                candidates.append((abs(gap - desired), gap, at_y, outgoing))
        if not candidates:
            raise ValueError(f"No force-driven placement for seed {seed}, contact {index}, y={y}, v={velocity}, remaining={items[index:]}")
        _, gap, y, velocity = min(candidates)
        tick += gap
        value = apply_item(value, item)
        events.append({"type": "diveStep", "item": item, "distance": tick * 2, "time": tick / 60,
                       "depth": (y + 6000) / height * 100, "velocity": velocity, "multiplier": value})
    assert value == raw_target
    tick += floor_ticks(y, velocity)
    # Reference braking runs 39 more ticks, consuming 39 world-distance units.
    # Zero-value rounds coast to the floor as well; no mid-flight termination.
    events.append({"type": "diveStep", "item": "ground", "distance": tick * 2 + 39,
                   "time": (tick + 39) / 60, "touchdownTime": tick / 60, "touchdownDistance": tick * 2,
                   "depth": 100, "velocity": 0, "multiplier": value * landing_bonus, "landingBonus": landing_bonus})
    events[0]["scenery"] = generate_scenery(events, seed)
    return events
