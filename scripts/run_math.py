"""Stage source inside the SDK's required games/ layout, run, validate, export."""
import csv
import io
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import zstandard

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "math/games/deep_dive"))
from route import apply_item, scenery_clear
from distribution import build_catalogue
from fractions import Fraction

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "math/games/deep_dive"
SDK = ROOT / ".stake/math-sdk"

if __name__ == "__main__":
    settings = json.loads((ROOT / "config/game.json").read_text())
    catalogue = build_catalogue(settings)
    target = SDK / "games/deep_dive"
    if not (SDK / "src").is_dir():
        raise SystemExit("Run scripts/setup_math.py first.")
    target.mkdir(parents=True, exist_ok=True)
    for source in SOURCE.glob("*.py"):
        shutil.copy2(source, target / source.name)
    # The SDK preserves an existing final/optimized table. This prototype does
    # not optimize; invalidate its old copied table when regenerating books.
    (target / "library/publish_files/lookUpTable_base_0.csv").unlink(missing_ok=True)
    env = {**os.environ, "DEEP_DIVE_CONFIG": str(ROOT / "config/game.json")}
    subprocess.run([sys.executable, str(target / "run.py")], cwd=SDK, env=env, check=True)
    library = SOURCE / "library"
    shutil.copytree(target / "library", library, dirs_exist_ok=True)
    publish = library / "publish_files"
    index = json.loads((publish / "index.json").read_text())
    mode = index["modes"][0]
    with (publish / mode["events"]).open("rb") as compressed:
        with zstandard.ZstdDecompressor().stream_reader(compressed) as stream:
            books = [json.loads(line) for line in io.TextIOWrapper(stream)]
    with (publish / mode["weights"]).open(newline="") as table:
        weights = [tuple(map(int, row)) for row in csv.reader(table)]
    backend = json.loads((library / "configs/config.json").read_text())
    shelf = backend["bookShelfConfig"][0]
    for info in [shelf["booksFile"], shelf["tables"][0]]:
        assert hashlib.sha256((publish / info["file"]).read_bytes()).hexdigest() == info["sha256"]
    assert shelf["rtp"] == settings["prototypeRtp"] and shelf["maxWin"] == settings["maxWin"]
    by_id = {book["id"]: book for book in books}
    assert len(books) == len(weights) == len(by_id) == len(catalogue)
    for sim_id, weight, payout in weights:
        assert (payout, weight) == catalogue[sim_id]
        assert weight > 0 and by_id[sim_id]["payoutMultiplier"] == payout
        events = by_id[sim_id]["events"]
        assert [event["index"] for event in events] == list(range(len(events)))
        assert events[-1]["type"] == "finalWin" and events[-1]["amount"] == payout
        value, distance = 100, -1
        assert events[-2]["item"] in ("wreck", "ground") and events[-2]["depth"] == 100
        for event in events[:-1]:
            value = apply_item(value, event["item"])
            assert event["multiplier"] == value
            assert event["distance"] > distance
            distance = event["distance"]
            if event is not events[-2]:
                assert event["depth"] < 100
        assert value == payout
        scenery = events[0]["scenery"]
        assert len(scenery) >= 60 and len({obj["id"] for obj in scenery}) == len(scenery)
        assert all(scenery_clear(events[:-1], obj["distance"], obj["depth"])
                   for obj in scenery if obj["item"] in ("bubble", "treasure", "chest", "pearl", "mine"))
        assert all(after["distance"] - before["distance"] >= 52 for before, after in zip(events[:-2], events[1:-1]))
        if payout == 0:
            assert events[-2]["item"] == "ground"
            assert sum(e.get("item") == "mine" for e in events) >= 8
    rtp = sum(weight * payout for _, weight, payout in weights) / sum(w for _, w, _ in weights) / 100
    assert Fraction(sum(w * p for _, w, p in weights), sum(w for _, w, _ in weights) * 100) == Fraction(str(settings["prototypeRtp"]))
    assert max(p for _, _, p in weights) == settings["maxWin"] * 100
    for sim_id, weight, _ in weights:
        by_id[sim_id]["selectionWeight"] = weight  # Local fixture metadata, not RGS events.
    fixture = ROOT / "frontend/public/demo-books.json"
    fixture.parent.mkdir(exist_ok=True)
    temporary_fixture = fixture.with_suffix(".tmp")
    temporary_fixture.write_text(json.dumps(books, indent=2) + "\n", encoding="utf-8")
    temporary_fixture.replace(fixture)
    fe_config = library / "configs/config_fe_deep_dive.json"
    shutil.copy2(fe_config, ROOT / "frontend/public/math-config.json")
    print(f"Validated {len(books)} books; weighted RTP {rtp:.2%}. Output: {publish}")
