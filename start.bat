@echo off
title FinPilot AI
color 0B
setlocal enabledelayedexpansion

echo ============================================================
echo   FinPilot AI -- UAE Accounting Software
echo   Starting services...
echo ============================================================
echo.

:: Create data directories if missing
if not exist "%USERPROFILE%\FinPilot" mkdir "%USERPROFILE%\FinPilot"
if not exist "%USERPROFILE%\FinPilot\exports" mkdir "%USERPROFILE%\FinPilot\exports"
if not exist "%USERPROFILE%\FinPilot\backups" mkdir "%USERPROFILE%\FinPilot\backups"

:: ── Locate Python ────────────────────────────────────────────────────────────
set PYTHON_CMD=
if exist "C:\Users\Zohair\AppData\Local\Programs\Python\Python314\python.exe" (
    set PYTHON_CMD="C:\Users\Zohair\AppData\Local\Programs\Python\Python314\python.exe"
    goto :python_found
)
where python >nul 2>&1
if %errorlevel% equ 0 ( set PYTHON_CMD=python & goto :python_found )
where python3 >nul 2>&1
if %errorlevel% equ 0 ( set PYTHON_CMD=python3 & goto :python_found )
where py >nul 2>&1
if %errorlevel% equ 0 ( set PYTHON_CMD=py & goto :python_found )

echo [ERROR] Python not found. Install Python 3.10+ and re-run.
pause & exit /b 1

:python_found
echo [OK] Python: %PYTHON_CMD%

:: ── Start Backend on port 8001 ───────────────────────────────────────────────
echo [1/2] Starting Backend API on http://127.0.0.1:8001 ...
start "FinPilot Backend" /min cmd /c "cd /d "%~dp0backend" && %PYTHON_CMD% -m uvicorn main:app --host 127.0.0.1 --port 8001"

:: Poll /health until backend is ready (up to ~30 s)
echo       Waiting for backend...
set /a tries=0
:wait_backend
ping 127.0.0.1 -n 2 >nul
curl -s -o nul -w "%%{http_code}" http://127.0.0.1:8001/health 2>nul | findstr /c:"200" >nul
if %errorlevel% equ 0 goto :backend_ready
set /a tries+=1
if %tries% geq 15 ( echo [WARN] Backend slow -- continuing anyway. & goto :backend_ready )
goto :wait_backend

:backend_ready
echo [OK] Backend ready at http://127.0.0.1:8001

:: ── Start Frontend ───────────────────────────────────────────────────────────
echo [2/2] Starting Frontend on http://localhost:3000 ...
start "FinPilot Frontend" /min cmd /c "cd /d "%~dp0frontend" && npm run dev"

ping 127.0.0.1 -n 7 >nul
echo [OK] Frontend started at http://localhost:3000

:: ── Open browser ─────────────────────────────────────────────────────────────
echo.
echo ============================================================
echo   FinPilot AI is running!
echo   Dashboard : http://localhost:3000
echo   API Docs  : http://127.0.0.1:8001/docs
echo ============================================================
echo.
start http://localhost:3000

echo Press any key to STOP all FinPilot services and exit...
pause >nul

:: ── Shutdown ─────────────────────────────────────────────────────────────────
echo Stopping FinPilot services...
taskkill /f /fi "WINDOWTITLE eq FinPilot Backend*" >nul 2>&1
taskkill /f /fi "WINDOWTITLE eq FinPilot Frontend*" >nul 2>&1
echo Done. Goodbye!
ping 127.0.0.1 -n 2 >nul
