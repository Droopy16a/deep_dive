"""Binary hashes of every math-side simulation state for cross-language checks."""
import hashlib
import json
from pathlib import Path
import struct
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "math/games/deep_dive"))
from flight_model import FlightModel


def record(model, digest):
    values = [model.value, model.y, model.vx, model.vy, model.ship_x, model.distance,
              model.finished, model.landed]
    for obj in model.objects:
        values.extend([obj.x, obj.y, obj.rocket, obj.respawns])
    digest.update(struct.pack("<" + "d" * len(values), *values))


results = []
for seed in json.load(sys.stdin):
    for layout in ("reference", "dive"):
        model, digest = FlightModel(seed, layout), hashlib.sha256()
        record(model, digest)
        while not model.finished:
            if model.tick >= 100000:
                raise RuntimeError("Unbounded simulation")
            model.step()
            record(model, digest)
        results.append([seed, layout, model.tick, digest.hexdigest()])
print(json.dumps(results))
