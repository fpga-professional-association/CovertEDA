# test_all_examples.ps1 - Test all vendor example projects
# Usage: powershell -ExecutionPolicy Bypass -File test_all_examples.ps1

$ErrorActionPreference = "SilentlyContinue"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  CovertEDA Example Test Suite" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ── Detect Radiant ────────────────────────────────────────────────────
$radiantBase = "C:\lscc\radiant"
$pnmainc = $null
if (Test-Path $radiantBase) {
    $versions = Get-ChildItem $radiantBase -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending
    foreach ($v in $versions) {
        $candidate = Join-Path $v.FullName "bin\nt64\pnmainc.exe"
        if (Test-Path $candidate) { $pnmainc = $candidate; break }
    }
}
if ($pnmainc) {
    Write-Host "  Radiant pnmainc: $pnmainc" -ForegroundColor Green
} else {
    Write-Host "  Radiant: NOT FOUND" -ForegroundColor Red
}
Write-Host ""

# ── Init submodules ───────────────────────────────────────────────────
Write-Host "[1/2] Updating submodules..." -ForegroundColor Yellow
Push-Location $scriptDir
git submodule update --init --recursive 2>$null | Out-Null
Pop-Location
Write-Host "  Done" -ForegroundColor Green
Write-Host ""

$allResults = @()

# ── Helper function ───────────────────────────────────────────────────
function Run-RadiantTest {
    param([string]$Name, [string]$ProjDir, [string]$RdfName)

    $rdfFile = Join-Path $ProjDir $RdfName
    $rdfUnix = ($rdfFile -replace '\\', '/')

    Write-Host "  $Name ... " -NoNewline

    if (-not (Test-Path $rdfFile)) {
        Write-Host "SKIP (no $RdfName)" -ForegroundColor Yellow
        return @{ Name=$Name; Status="SKIP" }
    }

    # Create TCL script - pnmainc executes this file directly
    $tclFile = Join-Path $ProjDir "_test_synth.tcl"
    $logFile = Join-Path $ProjDir "_test_synth.log"

    # Remove old log
    Remove-Item $logFile -ErrorAction SilentlyContinue

    @"
prj_open "$rdfUnix"
prj_run_synthesis
prj_close
"@ | Out-File -FilePath $tclFile -Encoding ascii

    $startTime = Get-Date

    # Run pnmainc with the TCL script as argument
    # Use Start-Process to capture all output and avoid PowerShell stderr issues
    $proc = Start-Process -FilePath $pnmainc -ArgumentList "`"$tclFile`"" `
        -WorkingDirectory $ProjDir `
        -RedirectStandardOutput $logFile `
        -RedirectStandardError (Join-Path $ProjDir "_test_stderr.log") `
        -NoNewWindow -Wait -PassThru

    $exitCode = $proc.ExitCode
    $duration = [math]::Round(((Get-Date) - $startTime).TotalSeconds, 1)

    # Read output
    $stdout = ""
    $stderr = ""
    if (Test-Path $logFile) { $stdout = Get-Content $logFile -Raw -ErrorAction SilentlyContinue }
    $stderrFile = Join-Path $ProjDir "_test_stderr.log"
    if (Test-Path $stderrFile) { $stderr = Get-Content $stderrFile -Raw -ErrorAction SilentlyContinue }
    $combined = "$stdout`n$stderr"

    # Cleanup temp files
    Remove-Item $tclFile -ErrorAction SilentlyContinue
    Remove-Item $logFile -ErrorAction SilentlyContinue
    Remove-Item $stderrFile -ErrorAction SilentlyContinue

    # Check for errors - look for "ERROR -" which is Radiant's error format
    $hasError = ($combined -match "ERROR -") -or ($exitCode -ne 0)

    if (-not $hasError) {
        Write-Host "PASS (${duration}s)" -ForegroundColor Green
        return @{ Name=$Name; Status="PASS"; Duration=$duration }
    } else {
        Write-Host "FAIL (${duration}s, exit=$exitCode)" -ForegroundColor Red
        # Show relevant error lines
        $errorLines = ($combined -split "`n") | Where-Object {
            $_ -match "ERROR" -or $_ -match "FAIL" -or $_ -match "cannot" -or $_ -match "not found" -or $_ -match "Invalid"
        } | Select-Object -First 5
        foreach ($el in $errorLines) {
            Write-Host "    $($el.Trim())" -ForegroundColor DarkRed
        }
        # If no error lines found, show last 5 lines
        if ($errorLines.Count -eq 0) {
            $lastLines = ($combined -split "`n") | Where-Object { $_.Trim() -ne "" } | Select-Object -Last 5
            foreach ($ll in $lastLines) {
                Write-Host "    $($ll.Trim())" -ForegroundColor DarkYellow
            }
        }
        return @{ Name=$Name; Status="FAIL"; Duration=$duration }
    }
}

# ── RADIANT TESTS ─────────────────────────────────────────────────────
if ($pnmainc) {
    Write-Host "[2/2] Testing Radiant examples..." -ForegroundColor Yellow
    Write-Host ""

    $radiantExamples = @(
        @{ Name="blinky_led";      Dir="blinky_led";      Rdf="blinky_led.rdf" },
        @{ Name="uart_controller"; Dir="uart_controller"; Rdf="uart_controller.rdf" },
        @{ Name="spi_flash";       Dir="spi_flash";       Rdf="spi_flash.rdf" },
        @{ Name="i2c_bridge";      Dir="i2c_bridge";      Rdf="i2c_bridge.rdf" },
        @{ Name="dsp_fir_filter";  Dir="dsp_fir_filter";  Rdf="dsp_fir_filter.rdf" }
    )

    foreach ($proj in $radiantExamples) {
        $projDir = Join-Path $scriptDir "examples\radiant\$($proj.Dir)"
        $result = Run-RadiantTest -Name $proj.Name -ProjDir $projDir -RdfName $proj.Rdf
        $allResults += $result
    }
    Write-Host ""
} else {
    Write-Host "[2/2] Skipping - Radiant not found" -ForegroundColor Yellow
}

# ── SUMMARY ───────────────────────────────────────────────────────────
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  RESULTS" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

$passed = ($allResults | Where-Object { $_.Status -eq "PASS" }).Count
$failed = ($allResults | Where-Object { $_.Status -eq "FAIL" }).Count
$skipped = ($allResults | Where-Object { $_.Status -eq "SKIP" }).Count

foreach ($r in $allResults) {
    $color = switch ($r.Status) { "PASS" { "Green" } "FAIL" { "Red" } default { "Yellow" } }
    $dur = if ($r.Duration) { " ({0}s)" -f $r.Duration } else { "" }
    Write-Host "  [$($r.Status)] $($r.Name)$dur" -ForegroundColor $color
}

Write-Host ""
Write-Host "  Total: $($allResults.Count) | Pass: $passed | Fail: $failed | Skip: $skipped" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
