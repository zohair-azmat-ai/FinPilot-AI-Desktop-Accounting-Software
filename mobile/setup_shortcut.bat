@echo off
title FinPilot — Create Desktop Shortcut
echo.
echo  Creating "FinPilot Mobile App" shortcut on your Desktop...
echo.

set "MYDIR=%~dp0"
set "SHORTCUT=%USERPROFILE%\Desktop\FinPilot Mobile App.lnk"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; ^
   $s  = $ws.CreateShortcut('%SHORTCUT%'); ^
   $s.TargetPath     = 'cmd.exe'; ^
   $s.Arguments      = '/k \"\"%MYDIR%start_mobile_app.bat\"\"'; ^
   $s.WorkingDirectory = '%MYDIR%'; ^
   $s.Description    = 'Start FinPilot Mobile App Development Server'; ^
   $s.WindowStyle    = 1; ^
   $s.Save()"

if exist "%SHORTCUT%" (
  echo  SUCCESS — Shortcut created on Desktop!
  echo.
  echo  Double-click "FinPilot Mobile App" on your Desktop to launch.
) else (
  echo  Could not create shortcut automatically.
  echo.
  echo  Manual alternative:
  echo    Right-click  start_mobile_app.bat
  echo    Select       "Send to" ^> "Desktop (create shortcut)"
)

echo.
pause
