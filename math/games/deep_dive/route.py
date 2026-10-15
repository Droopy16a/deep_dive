"""Choose an outcome first; construct an exact, deterministic presentation route.

All values are hundredths of a multiplier. Mines round down at that precision.
This allows a finite sequence of mines to reach zero without a hidden override.
"""
from collections import deque
import random
import math

OPERATIONS = ("bubble", "treasure", "chest", "pearl", "mine")
SCENERY_ITEMS = (*OPERATIONS, "fish", "shell", "bottle")


GRAVITY = 18.0
DRAG = .45
IMPULSES = {"bubble": 32.0, "treasure": 44.0, "chest": 70.0, "pearl": 56.0}


def integrate(depth: float, velocity: float, seconds: float) -> tuple[float, float]:
    """Exact solution of gravity plus linear water drag; no destination input."""
    terminal = GRAVITY / DRAG
    decay = math.exp(-DRAG * seconds)
    return (depth + terminal * seconds + (velocity-terminal)*(1-decay)/DRAG,
            terminal + (velocity-terminal)*decay)


def impact(depth: float, velocity: float, item: str) -> float:
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
    metres, _ = integrate(before["depth"]*launch["targetDepth"]/100, before["velocity"], seconds)
    return metres*100/launch["targetDepth"]


def scenery_clear(events: list[dict], distance: float, depth: float) -> bool:
    # Sweep a horizontal hull-sized window, not just the contact point, so an
    # uncollected item cannot visibly pass through the moving submarine.
    return all(abs(depth_at(events, distance + offset) - depth) >= 7.2*100/events[0]["targetDepth"]
               for offset in range(-18, 19, 3))


def generate_scenery(events: list[dict], seed: int) -> list[dict]:
    rng = random.Random(seed ^ 0xD33F)
    end = events[-1]["distance"]
    count = max(60, min(600, int(end // 9)))
    objects = []
    for _ in range(count * 40):
        item = rng.choice(SCENERY_ITEMS)
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
    for _ in range(rng.randint(2, 5)):
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

    # Choose irregular encounter distances, then simulate forces to discover
    # their depths. No segment aims at a prescribed next depth.
    gaps = []
    bands = [(52, 72), (90, 120), (145, 185)]
    first_bands = list(range(3)); rng.shuffle(first_bands)
    previous_band = -1
    minimum_depths = [rng.uniform(8,12) for _ in items]
    for index in range(len(items)):
        band = first_bands[index] if index < 3 else rng.choice([i for i in range(3) if i != previous_band])
        gaps.append(rng.randint(52,85) if items[index]=="mine" else rng.randint(*bands[band])); previous_band = band
    ground_loss = target == 0 and seed % 3 == 0
    near_floor = target_depth-rng.uniform(4,12)
    speed = rng.uniform(170,220)
    # Reject premature floor collisions, instead of bending a flight toward
    # the planned pickups. A single forward speed applies for the whole book.
    for attempt in range(30):
        value, distance, time, depth, velocity = 100, 0.0, 0.0, 0.0, 26.0
        events = [{"type":"diveStep", "item":"launch", "distance":0, "time":0,
                   "depth":0, "velocity":velocity, "multiplier":value,
                   "targetDepth":target_depth, "landingBonus":landing_bonus,
                   "physics":{"version":2,"gravity":GRAVITY,"drag":DRAG,"horizontalSpeed":speed}}]
        valid = True
        for index, (item, gap) in enumerate(zip(items,gaps)):
            seconds = gap/speed
            # Leave enough time to pass the physical apex and begin falling
            # before another encounter; never truncate a bounce halfway up.
            if velocity < 0:
                apex_time = math.log((GRAVITY/DRAG-velocity)/(GRAVITY/DRAG))/DRAG
                seconds = max(seconds, apex_time+.25)
            if item in IMPULSES and integrate(depth,velocity,seconds)[0] < minimum_depths[index]:
                seconds = max(seconds,descent_time(depth,velocity,minimum_depths[index]))
            if ground_loss and index == len(items)-1:
                seconds = descent_time(depth,velocity,near_floor)
                if seconds*speed < 52:
                    valid = False; break
            next_depth, incoming = integrate(depth,velocity,seconds)
            if not 0 <= next_depth < target_depth-(0 if ground_loss and index == len(items)-1 else 20):
                valid = False; break
            time += seconds; distance = time*speed; depth = next_depth
            velocity = impact(depth,incoming,item)
            value = apply_item(value,item)
            events.append({"type":"diveStep","item":item,"distance":distance,"time":time,
                           "depth":depth*100/target_depth,"velocity":velocity,"multiplier":value})
        if valid:
            break
        speed *= 1.15
    else:
        raise ValueError("Unable to simulate a collision-safe book")
    assert value == raw_target
    if target or ground_loss:
        seconds = descent_time(depth,velocity,target_depth)
        time += seconds
        events.append({"type":"diveStep","item":"ground","distance":time*speed,"time":time,
                       "depth":100,"velocity":0,"multiplier":value*landing_bonus,"landingBonus":landing_bonus})
    events[0]["scenery"] = generate_scenery(events, seed)
    return events
