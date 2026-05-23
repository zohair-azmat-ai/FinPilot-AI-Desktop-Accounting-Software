# ============================================================
#  FinPilot AI — Full Desktop Build Script
#  Run from project root: .\build.ps1
# ============================================================
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ProjectRoot  = $PSScriptRoot
$FrontendDir  = Join-Path $ProjectRoot "frontend"
$BackendDir   = Join-Path $ProjectRoot "backend"
$DesktopDir   = Join-Path $ProjectRoot "desktop"
$ResourcesDir = Join-Path $DesktopDir "src-tauri\resources"
$IconsDir     = Join-Path $DesktopDir "src-tauri\icons"

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  [!!] $msg" -ForegroundColor Yellow }
function Write-Fail($msg) { Write-Host "`n[FAIL] $msg" -ForegroundColor Red }

# ── 0. Pre-flight: Rust ────────────────────────────────────────────────────────
Write-Step "Checking Rust / Cargo"
$cargoOk = $false
try {
    $v = cargo --version 2>&1
    Write-OK "Cargo found: $v"
    $cargoOk = $true
} catch { }

if (-not $cargoOk) {
    Write-Fail "Rust / Cargo not found."
    Write-Host @"

  Rust is required to build the Tauri desktop wrapper.

  Install it now:
    1. Open https://rustup.rs in your browser
    2. Download and run rustup-init.exe
    3. Choose option 1 (default install — stable-msvc)
    4. Restart this terminal, then re-run .\build.ps1

"@ -ForegroundColor Yellow
    exit 1
}

# ── 0b. Pre-flight: VS C++ Build Tools ────────────────────────────────────────
Write-Step "Checking MSVC link.exe"
$linkOk = $false
$linkPaths = @(
    "C:\Program Files\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC",
    "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC",
    "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Tools\MSVC"
)
foreach ($p in $linkPaths) {
    if (Test-Path $p) { $linkOk = $true; break }
}
if (-not $linkOk) {
    # Quick check via where.exe
    try { $null = where.exe link 2>&1; $linkOk = $true } catch { }
}

if (-not $linkOk) {
    Write-Warn "VS C++ Build Tools may not be installed."
    Write-Host @"

  If the Tauri build fails with a linker error, install:
    Visual Studio Build Tools 2022 (free)
    https://aka.ms/vs/17/release/vs_BuildTools.exe
    -> Select "Desktop development with C++"

"@ -ForegroundColor Yellow
    Write-Host "  Continuing anyway (Rust itself may have bundled the linker)..." -ForegroundColor DarkGray
}

# ── 1. Python path ────────────────────────────────────────────────────────────
Write-Step "Locating Python"
$PythonExe = $null
$candidates = @(
    "C:\Users\Zohair\AppData\Local\Programs\Python\Python314\python.exe",
    "C:\Users\Zohair\AppData\Local\Programs\Python\Python313\python.exe",
    "C:\Users\Zohair\AppData\Local\Programs\Python\Python312\python.exe"
)
foreach ($c in $candidates) {
    if (Test-Path $c) { $PythonExe = $c; break }
}
if (-not $PythonExe) {
    try { $PythonExe = (where.exe python 2>&1 | Select-Object -First 1).Trim() } catch { }
}
if (-not $PythonExe) {
    Write-Fail "Python not found. Install Python 3.12+ and re-run."
    exit 1
}
Write-OK "Python: $PythonExe"
$pyVer = & $PythonExe --version 2>&1
Write-OK "Version: $pyVer"

# ── 2. Generate icons ─────────────────────────────────────────────────────────
Write-Step "Generating app icons"
& $PythonExe (Join-Path $ProjectRoot "make_icons.py")
if ($LASTEXITCODE -ne 0) { Write-Fail "Icon generation failed."; exit 1 }
Write-OK "Icons written to $IconsDir"

# ── 3. Build backend ──────────────────────────────────────────────────────────
Write-Step "Building backend (PyInstaller)"

# Install/upgrade PyInstaller (wrap in try/catch so stderr warnings don't terminate with Stop preference)
$piOk = $false
try {
    $savedEAP = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & $PythonExe -m pip install --quiet --upgrade pyinstaller
    $piOk = $LASTEXITCODE -eq 0
    $ErrorActionPreference = $savedEAP
} catch {
    Write-Warn "pip install pyinstaller: $_"
}

$BackendDistDir = Join-Path $BackendDir "dist\backend"
$PyInstallerOk  = $false

if ($piOk) {
    Write-Host "  Running PyInstaller..." -ForegroundColor DarkGray
    Push-Location $BackendDir
    try {
        & $PythonExe -m PyInstaller backend.spec --noconfirm 2>&1 | Tee-Object -Variable piOut
        if ($LASTEXITCODE -eq 0 -and (Test-Path $BackendDistDir)) {
            $PyInstallerOk = $true
            Write-OK "PyInstaller build succeeded → $BackendDistDir"
        } else {
            Write-Warn "PyInstaller build failed (Python 3.14 may be unsupported)."
        }
    } catch {
        Write-Warn "PyInstaller threw an exception: $_"
    } finally {
        Pop-Location
    }
}

# ── 3b. Fallback: Embedded Python 3.12 ───────────────────────────────────────
$EmbeddedPythonDir = Join-Path $ResourcesDir "python"
$UseEmbeddedPython = $false

if (-not $PyInstallerOk) {
    Write-Step "Fallback: Downloading embeddable Python 3.12"
    $EmbedUrl  = "https://www.python.org/ftp/python/3.12.9/python-3.12.9-embed-amd64.zip"
    $EmbedZip  = Join-Path $env:TEMP "python312-embed.zip"

    Write-Host "  Downloading $EmbedUrl ..." -ForegroundColor DarkGray
    try {
        Invoke-WebRequest -Uri $EmbedUrl -OutFile $EmbedZip -UseBasicParsing
        New-Item -ItemType Directory -Force -Path $EmbeddedPythonDir | Out-Null
        Expand-Archive -Path $EmbedZip -DestinationPath $EmbeddedPythonDir -Force
        Write-OK "Embedded Python extracted to $EmbeddedPythonDir"

        # Enable site-packages in embeddable Python (uncomment import site line)
        # Use UTF-8 WITHOUT BOM — PowerShell 5.1's "-Encoding utf8" writes BOM which breaks Python path resolution
        $utf8NoBom = New-Object System.Text.UTF8Encoding $false
        $pthFiles = Get-ChildItem $EmbeddedPythonDir -Filter "python*._pth" -ErrorAction SilentlyContinue
        foreach ($pth in $pthFiles) {
            $content = Get-Content $pth.FullName -Raw
            $content = $content -replace "#import site", "import site"
            [System.IO.File]::WriteAllText($pth.FullName, $content, $utf8NoBom)
        }

        # Install pip into embedded Python
        $getPip = Join-Path $env:TEMP "get-pip.py"
        Invoke-WebRequest -Uri "https://bootstrap.pypa.io/get-pip.py" -OutFile $getPip -UseBasicParsing
        $embPython = Join-Path $EmbeddedPythonDir "python.exe"
        & $embPython $getPip --quiet

        # Install backend dependencies into embedded Python
        $reqFile = Join-Path $BackendDir "requirements.txt"
        if (Test-Path $reqFile) {
            Write-Host "  Installing backend requirements into embedded Python..." -ForegroundColor DarkGray
            & $embPython -m pip install --quiet -r $reqFile --target (Join-Path $EmbeddedPythonDir "Lib\site-packages")
        } else {
            # Install known deps manually
            & $embPython -m pip install --quiet fastapi uvicorn sqlalchemy pydantic reportlab python-multipart
        }

        $UseEmbeddedPython = $true
        Write-OK "Embedded Python ready with dependencies"
    } catch {
        Write-Warn "Could not download embedded Python: $_"
        Write-Warn "The app will fall back to system Python at runtime."
    }
}

# ── 4. Copy backend into Tauri resources ─────────────────────────────────────
Write-Step "Copying backend into Tauri resources"
New-Item -ItemType Directory -Force -Path $ResourcesDir | Out-Null

if ($PyInstallerOk) {
    $DestBackend = Join-Path $ResourcesDir "backend"
    if (Test-Path $DestBackend) { Remove-Item $DestBackend -Recurse -Force }
    Copy-Item $BackendDistDir $DestBackend -Recurse
    Write-OK "Copied PyInstaller output → $DestBackend"
} else {
    # Copy backend source files (used with embedded Python or system Python)
    $DestBackend = Join-Path $ResourcesDir "backend"
    if (Test-Path $DestBackend) { Remove-Item $DestBackend -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $DestBackend | Out-Null

    $ExcludeDirs = @("__pycache__", ".venv", "venv", "dist", "build", ".git")
    Get-ChildItem $BackendDir -Recurse | Where-Object {
        $item = $_
        $skip = $false
        foreach ($ex in $ExcludeDirs) {
            if ($item.FullName -like "*\$ex\*" -or $item.Name -eq $ex) { $skip = $true; break }
        }
        -not $skip -and -not $item.PSIsContainer
    } | ForEach-Object {
        $rel  = $_.FullName.Substring($BackendDir.Length + 1)
        $dest = Join-Path $DestBackend $rel
        $destParent = Split-Path $dest -Parent
        if (-not (Test-Path $destParent)) { New-Item -ItemType Directory -Force -Path $destParent | Out-Null }
        Copy-Item $_.FullName $dest
    }
    Write-OK "Copied backend source → $DestBackend"
}

# ── 5. Build Next.js static export ───────────────────────────────────────────
Write-Step "Building Next.js frontend (static export)"
Push-Location $FrontendDir
try {
    # Install deps if node_modules missing
    if (-not (Test-Path "node_modules")) {
        Write-Host "  Running npm install..." -ForegroundColor DarkGray
        npm install --legacy-peer-deps
        if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
    }

    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Next.js build failed" }

    $OutDir = Join-Path $FrontendDir "out"
    if (-not (Test-Path $OutDir)) { throw "Next.js 'out' directory not found after build" }
    Write-OK "Static export at $OutDir"
} finally {
    Pop-Location
}

# ── 6. Install Tauri CLI ──────────────────────────────────────────────────────
Write-Step "Installing @tauri-apps/cli in desktop/"
Push-Location $DesktopDir
try {
    if (-not (Test-Path "node_modules")) {
        npm install --legacy-peer-deps
        if ($LASTEXITCODE -ne 0) { throw "npm install failed in desktop/" }
    }
} finally {
    Pop-Location
}
Write-OK "Tauri CLI ready"

# ── 7. Tauri build ────────────────────────────────────────────────────────────
Write-Step "Building Tauri desktop app (this may take 5-15 minutes first time)"
Push-Location $DesktopDir
try {
    npx tauri build
    if ($LASTEXITCODE -ne 0) { throw "Tauri build failed" }
} finally {
    Pop-Location
}

# ── 8. Report output ──────────────────────────────────────────────────────────
Write-Step "Build complete!"
$BundleDir = Join-Path $DesktopDir "src-tauri\target\release\bundle"
if (Test-Path $BundleDir) {
    Write-Host "`n  Installer(s) found:" -ForegroundColor Green
    Get-ChildItem $BundleDir -Recurse -Include "*.exe","*.msi" | ForEach-Object {
        Write-Host "    $($_.FullName)" -ForegroundColor White
    }
} else {
    Write-Warn "Bundle directory not found at expected path: $BundleDir"
    Write-Host "  Check $DesktopDir\src-tauri\target\release\ manually."
}

Write-Host "`n  Run the installer on any Windows PC to install FinPilot AI." -ForegroundColor Cyan
Write-Host "  The installed app launches without a browser or command window.`n" -ForegroundColor Cyan
