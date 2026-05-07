@echo off
title FinPilot AI — Backend Updater
color 0A

echo ============================================================
echo   FinPilot AI — Install Updated Backend
echo ============================================================
echo.

:: Must run as admin
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] This script must be run as Administrator.
    echo Right-click this file and choose "Run as administrator"
    pause & exit /b 1
)

set PROD_DIR=C:\Program Files\FinPilot AI\resources\backend
set DIST_DIR=%~dp0backend\dist\backend

if not exist "%DIST_DIR%\backend.exe" (
    echo [ERROR] Build not found at: %DIST_DIR%
    echo Run PyInstaller first: cd backend && python -m PyInstaller backend.spec --noconfirm
    pause & exit /b 1
)

echo [1/3] Stopping FinPilot AI backend...
taskkill /F /IM "backend.exe" /T >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq FinPilot*" >nul 2>&1
ping 127.0.0.1 -n 3 >nul

echo [2/3] Copying new backend...
robocopy "%DIST_DIR%" "%PROD_DIR%" /E /IS /IT /PURGE /NFL /NDL /NJH /NJS >nul
if %errorlevel% gtr 7 (
    echo [ERROR] Copy failed (robocopy error %errorlevel%)
    pause & exit /b 1
)
echo [OK] Backend updated.

echo [3/3] Verifying...
if exist "%PROD_DIR%\backend.exe" (
    echo [OK] backend.exe present.
) else (
    echo [ERROR] backend.exe not found after copy!
    pause & exit /b 1
)

:: Show mtime of key file to confirm update
for %%F in ("%PROD_DIR%\_internal\pdf_generator.py") do (
    echo [OK] pdf_generator.py: %%~tF
)
for %%F in ("%PROD_DIR%\_internal\models.py") do (
    echo [OK] models.py: %%~tF
)

echo.
echo ============================================================
echo   Backend updated successfully!
echo   Restart FinPilot AI to apply changes.
echo ============================================================
echo.
pause
