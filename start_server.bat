@echo off
cd /d C:\Users\harsh\fastapi-project
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 > server_out.log 2> server_err.log
