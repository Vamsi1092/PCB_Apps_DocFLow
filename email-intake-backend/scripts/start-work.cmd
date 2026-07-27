@echo off
setlocal

for %%I in ("%~dp0..") do set "PROJECT_DIR=%%~fI\"
set "VENV_DIR=%PROJECT_DIR%venv"
set "PYTHON_EXE=%VENV_DIR%\Scripts\python.exe"

if not exist "%PYTHON_EXE%" (
  echo Virtual environment not found at:
  echo   %VENV_DIR%
  echo.
  echo Creating it with installed Python...
  "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" -m venv "%VENV_DIR%"
  if errorlevel 1 (
    echo.
    echo Could not create the virtual environment.
    pause
    exit /b 1
  )
)

echo Starting activated project shell...
echo Project: %PROJECT_DIR%
echo.

cmd /k "cd /d ""%PROJECT_DIR%"" && call ""%VENV_DIR%\Scripts\activate.bat"" && python --version && pip --version"
