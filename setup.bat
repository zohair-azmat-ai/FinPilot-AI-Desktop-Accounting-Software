@echo off
title FinPilot AI — Setup
color 0A

echo ============================================================
echo   FinPilot AI — UAE Accounting Software Setup
echo ============================================================
echo.

:: Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found. Please install Python 3.10+ from python.org
    pause
    exit /b 1
)
echo [OK] Python found

:: Check Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please install Node.js 18+ from nodejs.org
    pause
    exit /b 1
)
echo [OK] Node.js found

:: Create FinPilot data directory
if not exist "%USERPROFILE%\FinPilot" mkdir "%USERPROFILE%\FinPilot"
if not exist "%USERPROFILE%\FinPilot\exports" mkdir "%USERPROFILE%\FinPilot\exports"
if not exist "%USERPROFILE%\FinPilot\backups" mkdir "%USERPROFILE%\FinPilot\backups"
echo [OK] Data directories created at %USERPROFILE%\FinPilot

:: Install backend dependencies
echo.
echo [1/3] Installing backend dependencies...
cd /d "%~dp0backend"
pip install -r requirements.txt --quiet
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install backend dependencies
    pause
    exit /b 1
)
echo [OK] Backend dependencies installed

:: Install frontend dependencies
echo.
echo [2/3] Installing frontend dependencies...
cd /d "%~dp0frontend"
npm install --silent
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install frontend dependencies
    pause
    exit /b 1
)
echo [OK] Frontend dependencies installed

:: Build frontend
echo.
echo [3/3] Building frontend...
npm run build
if %errorlevel% neq 0 (
    echo [WARNING] Frontend build had issues (may still work in dev mode)
)

echo.
echo ============================================================
echo   Setup Complete!
echo   Run 'start.bat' to launch FinPilot AI
echo ============================================================
echo.
pause
