@echo off
setlocal
for %%I in ("%~dp0..") do set "PROJECT_DIR=%%~fI"
set "PYTHON_EXE=%PROJECT_DIR%\venv\Scripts\python.exe"

if not exist "%PYTHON_EXE%" (
  echo Virtual environment not found. Run scripts\start-work.cmd first.
  exit /b 1
)

cd /d "%PROJECT_DIR%"
"%PYTHON_EXE%" -m uvicorn app.main:app --reload
