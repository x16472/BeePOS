@echo off
title BeePos
setlocal
cd /d "%~dp0"
if not defined BEE_ROOT set "BEE_ROOT=%~dp0"
where go >nul 2>nul
if errorlevel 1 goto missing
where node >nul 2>nul
if errorlevel 1 goto missing
if not exist ".venv\Scripts\python.exe" (
  echo Create the project venv first: py -3 -m venv .venv
  goto failed
)
".venv\Scripts\python.exe" --version
if errorlevel 1 goto missing
".venv\Scripts\python.exe" -c "import yaml"
if errorlevel 1 (
  echo Install Python dependencies: .venv\Scripts\python.exe -m pip install -r Backend\requirements.txt
  goto failed
)
cd Mobile
if not exist node_modules (
  echo Frontend dependencies are missing. Run npm install in Mobile first.
  goto failed
)
call npm run build
if errorlevel 1 goto failed
cd ..\Backend
go build -o beepos.exe .
if errorlevel 1 goto failed
beepos.exe
exit /b %errorlevel%
:missing
echo Please install Go, Node.js and Python 3.10 or later.
:failed
echo Bee POS could not start. Please check the errors above and Database\main.log.
pause
exit /b 1
