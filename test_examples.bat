@echo off
setlocal enabledelayedexpansion
echo ============================================
echo   CovertEDA Example Project Test Runner
echo ============================================
echo.

REM Step 1: Pull latest and build
echo [1/4] Pulling latest from git...
git pull --recurse-submodules
if errorlevel 1 (
    echo WARN: git pull failed, continuing with local code
)
git submodule update --init --recursive

echo.
echo [2/4] Installing npm dependencies...
call npm install
if errorlevel 1 (
    echo ERROR: npm install failed
    pause
    exit /b 1
)

echo.
echo [3/4] Building CovertEDA release...
call npm run tauri build 2>&1
if errorlevel 1 (
    echo ERROR: Tauri build failed
    echo Check the error output above
    pause
    exit /b 1
)

REM Find the built exe
set "EXE="
for /r "src-tauri\target\release" %%f in (*.exe) do (
    if "%%~nxf"=="CovertEDA.exe" set "EXE=%%f"
    if "%%~nxf"=="coverteda.exe" set "EXE=%%f"
)

if "%EXE%"=="" (
    for /r "src-tauri\target\release\bundle" %%f in (*.exe) do (
        set "EXE=%%f"
    )
)

if "%EXE%"=="" (
    echo ERROR: Could not find built exe
    echo Looking in src-tauri\target\release\
    dir /s /b src-tauri\target\release\*.exe 2>nul
    pause
    exit /b 1
)

echo.
echo [4/4] Built successfully: %EXE%
echo.
echo ============================================
echo   Starting CovertEDA...
echo ============================================
echo.
echo CovertEDA will launch. To test examples:
echo   1. Open each project from examples\radiant\ (use .rdf files)
echo   2. Open each project from examples\quartus\ (use .qpf files)
echo   3. Click "Build" to run synthesis
echo.
start "" "%EXE%"
echo.
echo CovertEDA launched. Press any key to exit this window.
pause
