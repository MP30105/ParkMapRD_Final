param(
    [int]$Port = 5000,
    [switch]$VerboseMode
)

Write-Host "[restart] Iniciando reinicio backend en puerto $Port" -ForegroundColor Cyan

function Get-PortPids($Port) {
    $pids = @()
    try {
        # Prefer Get-NetTCPConnection if available
        if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
            $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
            if ($conns) { $pids += ($conns | Select-Object -ExpandProperty OwningProcess) }
        }
    } catch {}
    if (-not $pids -or $pids.Count -eq 0) {
        # Fallback to netstat parsing for Windows PowerShell 5
        netstat -ano | findstr ":$Port" | ForEach-Object {
            $parts = ($_ -split '\s+')
            if ($parts.Length -ge 5) {
                $pid = $parts[-1]
                if ($pid -match '^[0-9]+$') { $pids += [int]$pid }
            }
        }
    }
    $pids | Select-Object -Unique
}

# 1. Obtener PIDs en uso
$pids = Get-PortPids -Port $Port
if ($pids -and $pids.Count -gt 0) {
    Write-Host "[restart] Puerto $Port ocupado por PIDs: $($pids -join ', ') -> terminando" -ForegroundColor Yellow
    foreach ($procId in $pids) {
        try {
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
            Write-Host "[restart] Terminado PID $procId" -ForegroundColor DarkYellow
        } catch {
            # Evitar expansión de $_ dentro de string con ':' que causó error de parser
            $errMsg = $_.Exception.Message
            Write-Host "[restart] No se pudo terminar PID $procId - Error: $errMsg" -ForegroundColor Red
        }
    }
    Start-Sleep -Milliseconds 600
} else {
    Write-Host "[restart] Puerto $Port libre" -ForegroundColor Green
}

# 2. Iniciar backend de forma desacoplada
$backendPath = Split-Path -Parent $PSScriptRoot
Write-Host "[restart] Lanzando node server.js en $backendPath" -ForegroundColor Cyan
$startInfo = @{ FilePath = 'node'; ArgumentList = 'server.js'; WorkingDirectory = $backendPath; WindowStyle = 'Hidden' }
if ($VerboseMode) { $startInfo.WindowStyle = 'Normal' }
$proc = Start-Process @startInfo -PassThru
Write-Host "[restart] PID nuevo: $($proc.Id)" -ForegroundColor Green

# 3. Esperar health
$maxAttempts = 20
$healthOk = $false
for ($i=1; $i -le $maxAttempts; $i++) {
    Start-Sleep -Milliseconds 500
    try {
        $resp = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$Port/api/health" -TimeoutSec 2
        if ($resp.StatusCode -eq 200 -and $resp.Content -match '"ok":true') {
            $healthOk = $true
            break
        }
    } catch {
        if ($VerboseMode) { Write-Host "[restart] intento $i fallo: $_" -ForegroundColor DarkGray }
    }
}

# 4. Version
$versionData = $null
if ($healthOk) {
    try {
        $versionData = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$Port/api/version" -TimeoutSec 3 | Select-Object -ExpandProperty Content
    } catch {}
}

# 5. Resultado
$result = [PSCustomObject]@{
    Port = $Port
    PID = $proc.Id
    Health = if ($healthOk) { 'ok' } else { 'failed' }
    VersionJson = $versionData
    Timestamp = (Get-Date).ToString('o')
}

Write-Host "[restart] Resultado:" -ForegroundColor Cyan
$result | Format-List

if (-not $healthOk) {
    Write-Host "[restart] Advertencia: health no respondió dentro de tiempo." -ForegroundColor Red
    exit 1
}

exit 0
