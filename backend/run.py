"""PyInstaller entry point for FinPilot AI backend."""
import sys
import os
import traceback

# ── Log file (written even in windowless builds so we can debug crashes) ──────
_LOG = os.path.join(os.path.expanduser("~"), "FinPilot", "backend.log")
os.makedirs(os.path.dirname(_LOG), exist_ok=True)
_log_fh = open(_LOG, "w", buffering=1, encoding="utf-8")

def _log(msg):
    _log_fh.write(msg + "\n")
    _log_fh.flush()

# ── Frozen (PyInstaller) environment setup ────────────────────────────────────
_log(f"run.py start | frozen={getattr(sys, 'frozen', False)} | exe={sys.executable}")

if getattr(sys, "frozen", False):
    bundle_dir = getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
    sys.path.insert(0, bundle_dir)
    routes_dir = os.path.join(bundle_dir, "routes")
    if routes_dir not in sys.path:
        sys.path.insert(0, routes_dir)
    _log(f"bundle_dir={bundle_dir}")
    _log(f"sys.path={sys.path[:5]}")

    # console=False sets sys.stdout/stderr to None — redirect to devnull so
    # uvicorn's logging setup never calls .isatty() on a None stream.
    _devnull = open(os.devnull, "w")
    if sys.stdout is None:
        sys.stdout = _devnull
    if sys.stderr is None:
        sys.stderr = _devnull

try:
    import uvicorn
    _log("uvicorn imported OK")
except Exception:
    _log("FAILED to import uvicorn:\n" + traceback.format_exc())
    sys.exit(1)


def run():
    try:
        _log("importing main.app ...")
        from main import app  # noqa: PLC0415
        _log("main.app imported OK — starting uvicorn on 127.0.0.1:8001")
        uvicorn.run(
            app,
            host="127.0.0.1",
            port=8001,
            log_config=None,
            access_log=False,
        )
    except Exception:
        _log("CRASH in run():\n" + traceback.format_exc())
        sys.exit(1)


if __name__ == "__main__":
    run()
