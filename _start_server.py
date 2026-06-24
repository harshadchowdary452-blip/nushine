"""Start uvicorn server and wait for it to be ready"""
import subprocess
import sys
import time
import urllib.request

cmd = [
    sys.executable, "-m", "uvicorn",
    "app.main:app",
    "--host", "0.0.0.0",
    "--port", "8000",
]

proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

# Wait for server to be ready
for i in range(30):
    try:
        urllib.request.urlopen("http://localhost:8000/docs", timeout=2)
        print(f"Server ready on port 8000 (PID={proc.pid})")
        sys.stdout.flush()
        proc.wait()
    except Exception:
        time.sleep(1)

if proc.poll() is None:
    print("Server timed out waiting, killing")
    proc.kill()
else:
    out, err = proc.communicate()
    print(f"Server exited: {out.decode(errors='replace')[:500]}")
    print(f"Errors: {err.decode(errors='replace')[:500]}")
