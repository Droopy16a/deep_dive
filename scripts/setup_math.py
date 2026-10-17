"""Fetch a pinned official SDK and create an isolated Python environment."""
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SDK = ROOT / ".stake" / "math-sdk"
COMMIT = "a6dccd86de740cc5d318079483cb6204cc5c19bc"

def run(*args):
    subprocess.run(args, check=True, cwd=ROOT)

if __name__ == "__main__":
    if sys.version_info[:2] != (3, 12):
        raise SystemExit("The pinned math dependencies require Python 3.12. Install it, then run: py -3.12 scripts/setup_math.py")
    env = ROOT / ".stake" / "venv"
    python = env / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")
    if env.exists():
        current = subprocess.run([str(python), "-c", "import sys; print('%s.%s' % sys.version_info[:2])"],
                                 capture_output=True, text=True) if python.exists() else None
        if current is None or current.returncode or current.stdout.strip() != "3.12":
            # Preserve the failed environment rather than mixing interpreters.
            backup = env.with_name("venv-backup-" + datetime.now().strftime("%Y%m%d-%H%M%S-%f"))
            env.resolve().relative_to((ROOT / ".stake").resolve())
            env.rename(backup)
            print(f"Preserved previous environment at {backup}", flush=True)
    if not SDK.exists():
        SDK.parent.mkdir(exist_ok=True)
        run("git", "clone", "https://github.com/engineio/math-sdk.git", str(SDK))
    run("git", "-C", str(SDK), "checkout", "--detach", COMMIT)
    run(sys.executable, "-m", "venv", str(env))
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
