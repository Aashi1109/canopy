"""Fixed supervisor child launcher. Limits are set after UID drop, before execution."""
import json
import os
import resource
import sys

limits = json.loads(sys.argv[1])
resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
resource.setrlimit(resource.RLIMIT_FSIZE, (limits["fileBytes"], limits["fileBytes"]))
resource.setrlimit(resource.RLIMIT_NOFILE, (256, 256))
cpu_seconds = min(600, max(1, (limits["workMs"] + 999) // 1000))
resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds))
if sys.platform == "linux" and hasattr(resource, "RLIMIT_NPROC"):
    # This is per UID. Production has the dedicated engine UID; applying it to
    # a developer's macOS login UID would count unrelated applications.
    resource.setrlimit(resource.RLIMIT_NPROC, (128, 128))
os.umask(0o077)
command = sys.argv[2:]
runner = os.path.join(os.path.dirname(__file__), "ytdlp_runner.py")
if command[:3] == [sys.executable, "-I", runner] and len(command) == 4:
    # This is already a fresh, isolated Python child with the engine UID and
    # process-group/resource limits. Avoid starting that interpreter twice.
    import runpy
    sys.argv = command[2:]
    runpy.run_path(runner, run_name="__main__")
else:
    os.execvpe(command[0], command, os.environ)
