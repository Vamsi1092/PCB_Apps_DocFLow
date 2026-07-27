$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $scriptDir
$venvPython = Join-Path $projectDir "venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $venvPython)) {
    throw "Virtual environment not found. Run scripts\start-work.ps1 first."
}

Set-Location $projectDir
& $venvPython -m uvicorn app.main:app --reload
