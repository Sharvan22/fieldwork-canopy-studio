@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 20.19 or later, then open Start Demo again.
  pause
  exit /b 1
)
echo Open the address printed below in your browser. Press Ctrl+C to stop the demo.
node dist/server.mjs
if errorlevel 1 pause

