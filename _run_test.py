"""Start server, run test, print pass/fail summary"""
import subprocess, sys, time, urllib.request
from pathlib import Path

venv = Path("venv/Scripts/python.exe").resolve()

# Start server
proc = subprocess.Popen(
    [str(venv), "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"],
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
)

# Wait for it
for i in range(30):
    try:
        urllib.request.urlopen("http://localhost:8000/docs", timeout=2)
        print(f"Server ready (PID={proc.pid})", flush=True)
        break
    except:
        time.sleep(1)
else:
    print("Server failed to start")
    proc.kill()
    sys.exit(1)

# Run test
test_script = Path("test_crm_workflow.py").resolve()
result = subprocess.run([str(venv), str(test_script)], capture_output=True, text=True, timeout=120)
print(result.stdout[-2000:] if len(result.stdout) > 2000 else result.stdout)
print("---PASS/FAIL/WARN---")
for line in result.stdout.split('\n'):
    if '[PASS]' in line or '[FAIL]' in line or '[WARN]' in line:
        print(line)

# Stop server
proc.terminate()
try:
    proc.wait(timeout=5)
except:
    proc.kill()
