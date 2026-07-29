Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\harsh\fastapi-project"
WshShell.Run "python -m uvicorn app.main:app --host 0.0.0.0 --port 8000", 0, False
