"""Fetch a pinned official SDK and create an isolated Python environment."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SDK = ROOT / ".stake" / "math-sdk"
COMMIT = "a6dccd86de740cc5d318079483cb6204cc5c19bc"

def run(*args):
    subprocess.run(args, check=True, cwd=ROOT)

if __name__ == "__main__":
    if sys.version_info < (3, 12):
        raise SystemExit("Use Python 3.12 or newer (Windows: py -3.12 scripts/setup_math.py).")
    if not SDK.exists():
        SDK.parent.mkdir(exist_ok=True)
        run("git", "clone", "https://github.com/engineio/math-sdk.git", str(SDK))
    run("git", "-C", str(SDK), "checkout", "--detach", COMMIT)
    env = ROOT / ".stake" / "venv"
    run(sys.executable, "-m", "venv", str(env))
    python = env / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")
    # Upstream requirements installs another Git revision of the SDK itself.
    # Keep its package dependencies, but install THIS pinned local checkout.
    requirements = ROOT / ".stake" / "requirements-sdk.txt"
    requirements.write_text("\n".join(
        line for line in (SDK / "requirements.txt").read_text().splitlines()
        if not line.startswith("-e git+")
    ) + "\n", encoding="utf-8")
    locked = ROOT / "math" / "requirements.lock.txt"
    run(str(python), "-m", "pip", "install", "-r", str(locked if locked.exists() else requirements))
    run(str(python), "-m", "pip", "install", "-e", str(SDK))
    print("Math SDK ready. Run scripts/run_math.py with this environment's Python.")
