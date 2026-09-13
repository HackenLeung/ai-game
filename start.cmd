@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 18 or newer, or open index.html directly.
  pause
  exit /b 1
)
node scripts/serve.cjs --open
if errorlevel 1 pause
