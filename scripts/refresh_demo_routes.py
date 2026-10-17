"""Refresh demo presentation routes without changing IDs, payouts or weights.

For live RGS exports, run run_math.py with the pinned SDK instead.
"""
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "math/games/deep_dive"))
from route import generate_route


if __name__ == "__main__":
    for depth in (100, 300, 600):
        name = "demo-books.json" if depth == 100 else f"demo-books-depth_{depth}.json"
        path = ROOT / "frontend/public" / name
        books = json.loads(path.read_text(encoding="utf-8"))
        for book in books:
            events = generate_route(book["payoutMultiplier"], book["id"] + depth * 10000, depth, depth // 100)
            book["events"] = [{"index": index, **event} for index, event in enumerate(events)]
            book["events"].append({"index": len(events), "type": "finalWin", "amount": book["payoutMultiplier"]})
        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps(books, separators=(",", ":")) + "\n", encoding="utf-8")
        temporary.replace(path)
        print(f"Refreshed {depth} m: {len(books)} routes", flush=True)
