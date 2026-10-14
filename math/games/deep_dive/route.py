"""Choose an outcome first; construct an exact, deterministic presentation route.

All values are hundredths of a multiplier. Mines round down at that precision.
This allows a finite sequence of mines to reach zero without a hidden override.
"""
from collections import deque
import random

OPERATIONS = ("bubble", "treasure", "chest", "pearl", "mine")
SCENERY_ITEMS = (*OPERATIONS, "fish", "shell", "bottle")


def depth_at(events: list[dict], distance: float) -> float:
    """Same swept vertical trajectory used by frontend flight interpolation."""
    from math import sin, pi
    if distance <= 0:
        return events[0]["depth"]
    for before, after in zip(events, events[1:]):
        if distance <= after["distance"]:
            t = (distance - before["distance"]) / (after["distance"] - before["distance"])
            lift = 12 if before["item"] in OPERATIONS[:-1] else 0
            baseline = before["depth"] + (after["depth"] - before["depth"]) * t
            down_kick = min(12 * sin(pi * t), (100 - baseline) * .55) if before["item"] == "mine" else 0
            return max(8, min(100, baseline - sin(pi * t) * lift + down_kick))
    return events[-1]["depth"]


def scenery_clear(events: list[dict], distance: float, depth: float) -> bool:
    # Sweep a horizontal hull-sized window, not just the contact point, so an
    # uncollected item cannot visibly pass through the moving submarine.
    return all(abs(depth_at(events, distance + offset) - depth) >= 20
               for offset in range(-18, 19, 3))


def generate_scenery(events: list[dict], seed: int) -> list[dict]:
    rng = random.Random(seed ^ 0xD33F)
    end = events[-1]["distance"]
    count = max(60, end // 9)
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


def generate_route(target: int, seed: int) -> list[dict]:
    rng = random.Random(seed)
    # Every route begins with a rewarding mix of all four positive mechanics.
    items = ["bubble", "treasure", "chest", "pearl"]
    rng.shuffle(items)
    # Vary both encounter count and travel distance independently of the target.
    items.extend(rng.choices(OPERATIONS[:-1], k=rng.randint(0, 3)))
    for _ in range(rng.randint(0, 4)):
        position = rng.randrange(len(items) + 1)
        items[position:position] = ["chest", "mine"]  # Exact identity, including odd cents.
    value = 100
    for item in items:
        value = apply_item(value, item)
    if target == 0:
        # A good opening followed by enough mines to naturally exhaust value.
        while value:
            items.append("mine")
            value = apply_item(value, "mine")
    else:
        items.extend(complete_path(value, target, rng))

    value, distance, depth = 100, 0, 30
    events = [{"type": "diveStep", "item": "launch", "distance": 0,
               "depth": depth, "multiplier": value}]
    gap_max = rng.randint(80, 136)
    for index, item in enumerate(items):
        distance += rng.randint(52, gap_max)
        if item == "mine":
            remaining = items[index:].count("mine")
            depth = min(90, depth + max(3, (88 - depth) // (remaining + 1)))
        else:
            depth = max(25, min(63, depth + rng.randint(-9, 7)))
        value = apply_item(value, item)
        events.append({"type": "diveStep", "item": item, "distance": distance,
                       "depth": depth, "multiplier": value})
    assert value == target
    events.append({"type": "diveStep", "item": "ground",
                   "distance": distance + rng.randint(60, 150), "depth": 100, "multiplier": value})
    # Presentation only. Kept in the book so reconnect/replay shows the same sea.
    events[0]["scenery"] = generate_scenery(events, seed)
    return events
