@echo off
title FinPilot Mobile App — Expo Server
color 0B
cls

echo.
echo  ====================================================
echo    FinPilot AI  —  Mobile App Development Server
echo  ====================================================
echo.
echo  Starting Expo... (first launch may take 30 seconds)
echo.
echo  Once the QR code appears:
echo    iPhone  : Open Camera app and scan the QR code
echo    Android : Open Expo Go app and scan the QR code
echo.
echo  Press Ctrl+C to stop the server.
echo  ====================================================
echo.

cd /d "%~dp0"
call npx expo start --clear

echo.
echo  Server stopped.
pause >nul
