$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $scriptDir
$venvDir = Join-Path $projectDir "venv"
$venvPython = Join-Path $venvDir "Scripts\python.exe"
$installedPython = Join-Path $env:LOCALAPPDATA "Programs\Python\Python313\python.exe"

if (-not (Test-Path $venvPython)) {
    Write-Host "Virtual environment not found. Creating it..."
    & $installedPython -m venv $venvDir
    if ($LASTEXITCODE -ne 0) {
        throw "Could not create the virtual environment."
    }
}

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
$env:Path = "$venvDir\Scripts;$userPath;$machinePath"
$env:VIRTUAL_ENV = $venvDir

Set-Location $projectDir
Write-Host "Activated: $venvDir"
python --version
pip --version
