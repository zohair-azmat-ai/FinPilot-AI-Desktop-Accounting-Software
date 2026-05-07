@echo off
title FinPilot AI — Backend
cd /d "%~dp0backend"
echo Starting FinPilot AI Backend on http://127.0.0.1:8000 ...
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
