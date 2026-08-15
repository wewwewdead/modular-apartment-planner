@echo off
rem Rebuilds the app from source, then opens it. The "Update Apartment
rem Planner" desktop shortcut points here.
cd /d "%~dp0"
echo Rebuilding Apartment Planner from source...
call npm run build
if errorlevel 1 (
  echo.
  echo Build failed - the app was NOT updated. See errors above.
  pause
  exit /b 1
)
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
