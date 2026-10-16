"""Run the pinned official SDK, validate all depth modes, export RGS and demo files."""
import csv
import io
import hashlib
import json
import os
import re
from pathlib import Path
import shutil
import subprocess
import sys
from fractions import Fraction
import zstandard

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "math/games/deep_dive"
SDK = ROOT / ".stake/math-sdk"
sys.path.insert(0, str(SOURCE))
from route import apply_item, scenery_clear, integrate, impact
from depths import build_depth_models


def write_json(path, data):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(data, separators=(",", ":")) + "\n", encoding="utf-8")
    temporary.replace(path)


def prune_removed_modes(library, modes):
    """Remove generated files for modes no longer present in game.json."""
    removed = 0
    for path in library.rglob("*"):
        match = re.search(r"depth_(\d+)(?=[_.]|$)", path.name)
        if path.is_file() and match and f"depth_{match.group(1)}" not in modes:
            path.resolve().relative_to(ROOT.resolve())
            path.unlink()
            removed += 1
    force = library / "forces/force.json"
    if force.exists():
        data = json.loads(force.read_text(encoding="utf-8"))
        retained = {mode: value for mode, value in data.items() if mode in modes}
        if retained != data:
            write_json(force, retained)
    return removed


if __name__ == "__main__":
    settings = json.loads((ROOT / "config/game.json").read_text(encoding="utf-8"))
    models = build_depth_models(settings)
    staged = SDK / "games/deep_dive"
    if not (SDK / "src").is_dir():
        raise SystemExit("Run scripts/setup_math.py first.")
    staged.mkdir(parents=True, exist_ok=True)
    for source in SOURCE.glob("*.py"):
        shutil.copy2(source, staged / source.name)
    for generated in [staged / "library", SOURCE / "library"]:
        print(f"Pruned {prune_removed_modes(generated, models)} obsolete generated files from {generated}", flush=True)
    for fixture in (ROOT / "frontend/public").glob("demo-books-depth_*.json"):
        if fixture.stem.removeprefix("demo-books-") not in models:
            fixture.resolve().relative_to(ROOT.resolve())
            fixture.unlink()
    for mode in models:
        (staged / f"library/publish_files/lookUpTable_{mode}_0.csv").unlink(missing_ok=True)
    subprocess.run([sys.executable, str(staged / "run.py")], cwd=SDK,
                   env={**os.environ, "DEEP_DIVE_CONFIG": str(ROOT / "config/game.json")}, check=True)
    library = SOURCE / "library"
    shutil.copytree(staged / "library", library, dirs_exist_ok=True)
    publish = library / "publish_files"
    index = json.loads((publish / "index.json").read_text())
    backend = json.loads((library / "configs/config.json").read_text())
    force_info = backend["standardForceFile"]
    assert hashlib.sha256((library / "forces" / force_info["file"]).read_bytes()).hexdigest() == force_info["sha256"]
    assert set(json.loads((library / "forces/force.json").read_text())) == set(models)
    assert {entry["name"] for entry in index["modes"]} == set(models)
    expected_files = {"index.json"} | {entry[key] for entry in index["modes"] for key in ("events", "weights")}
    assert {path.name for path in publish.iterdir() if path.is_file()} == expected_files
    total_books = 0
    for entry in index["modes"]:
        mode = entry["name"]
        model = models[mode]
        shelf = next(shelf for shelf in backend["bookShelfConfig"] if shelf["name"] == mode)
        for info in [shelf["booksFile"], shelf["tables"][0]]:
            assert hashlib.sha256((publish / info["file"]).read_bytes()).hexdigest() == info["sha256"]
        assert shelf["rtp"] == model["rtp"] and shelf["maxWin"] == model["maxWin"]
        with (publish / entry["events"]).open("rb") as compressed:
            with zstandard.ZstdDecompressor().stream_reader(compressed) as stream:
                books = [json.loads(line) for line in io.TextIOWrapper(stream)]
        with (publish / entry["weights"]).open(newline="") as file:
            weights = [tuple(map(int,row)) for row in csv.reader(file)]
        by_id = {book["id"]: book for book in books}
        assert len(books) == len(weights) == len(by_id) == len(model["catalogue"])
        for sim_id, weight, payout in weights:
            assert (payout,weight) == model["catalogue"][sim_id]
            book = by_id[sim_id]
            assert book["payoutMultiplier"] == payout
            events = book["events"]
            assert [event["index"] for event in events] == list(range(len(events)))
            assert events[-1]["type"] == "finalWin" and events[-1]["amount"] == payout
            steps = events[:-1]
            assert steps[0]["targetDepth"] == model["depth"] and steps[0]["landingBonus"] == model["landingBonus"]
            value, distance = 100, -1
            for position, event in enumerate(steps):
                terminal = position == len(steps)-1
                physics = steps[0]["physics"]
                expected_distance = event["touchdownDistance"] + 39 if physics["version"] == 3 and event["item"] == "ground" else event["time"] * physics["horizontalSpeed"]
                assert abs(event["distance"] - expected_distance) < 1e-6
                if position:
                    previous = steps[position-1]
                    dt = event["time"]-previous["time"]
                    assert dt>0
                    y,v = integrate(previous["depth"]*model["depth"]/100,previous["velocity"],dt,physics)
                    assert abs(y-event["depth"]*model["depth"]/100)<1e-6
                    outgoing = 0 if event["item"]=="ground" else impact(y,v,event["item"],physics)
                    assert abs(outgoing-event["velocity"])<1e-6
                if event["item"] == "ground":
                    assert terminal and event["depth"] == 100
                    if value == 0:
                        assert steps[position-1]["item"] == "mine"
                        if physics["version"] == 2:
                            assert (100-steps[position-1]["depth"])*model["depth"]/100 <= 12.01
                    assert event["landingBonus"] == model["landingBonus"]
                    value *= event["landingBonus"]
                else:
                    assert event["depth"] < 100
                    value = apply_item(value,event["item"])
                assert event["multiplier"] == value and event["distance"] > distance
                assert value > 0 or (terminal and event["item"] in ("mine", "ground")) or (
                    position == len(steps)-2 and event["item"] == "mine" and steps[-1]["item"] == "ground"
                    and (physics["version"] == 3 or (100-event["depth"])*model["depth"]/100 <= 12.01))
                distance = event["distance"]
            assert value == payout
            assert payout == 0 or steps[-1]["item"] == "ground"
            if payout == 0:
                assert steps[-1]["multiplier"] == 0
            assert all(after["distance"]-before["distance"] >= 8-1e-6 for before,after in zip(steps,steps[1:]) if after["item"] != "ground")
            scenery = steps[0]["scenery"]
            assert len(scenery) >= 60 and len({obj["id"] for obj in scenery}) == len(scenery)
            assert all(scenery_clear(steps,obj["distance"],obj["depth"]) for obj in scenery
                       if obj["item"] in ("bubble","treasure","chest","pearl","mine"))
            book["selectionWeight"] = weight
        total = sum(w for _,w,_ in weights)
        assert Fraction(sum(w*p for _,w,p in weights),total*100) == Fraction(str(model["rtp"]))
        assert max(p for _,_,p in weights) == model["maxWin"]*100
        assert Fraction(sum(w for _,w,p in weights if p>0),total) == Fraction(1,2*model["landingBonus"])
        name = "demo-books.json" if mode == "base" else f"demo-books-{mode}.json"
        write_json(ROOT / "frontend/public" / name,books)
        total_books += len(books)
        print(f"Validated {mode}: {len(books)} books, RTP {model['rtp']:.2%}, landing {model['winProbability']:.2%}")
    base = models["base"]
    write_json(ROOT / "frontend/public/math-model.json", {
        "rtp": base["rtp"], "maxWin": base["maxWin"], "outcomes": base["outcomes"],
        "distribution": settings["distribution"], "description": settings["mathModel"],
        "modes": [{key:value for key,value in model.items() if key != "catalogue"} for model in models.values()],
    })
    shutil.copy2(library / "configs/config_fe_deep_dive.json",ROOT / "frontend/public/math-config.json")
    print(f"Validated {total_books} books across {len(models)} depth modes. Publish: {publish}")
