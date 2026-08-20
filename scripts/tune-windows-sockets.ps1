<# 
.SYNOPSIS
    Windows socket tuning for high-concurrency FastAPI servers.
.DESCRIPTION
    Fixes WinError 10055 (socket buffer exhaustion) by:
    1. Increasing max user ports (default 5000 → 65534)
    2. Reducing TIME_WAIT timeout (default 240s → 30s)
    3. Enabling TCP keepalive (idle=60s, interval=10s, count=6)
    4. Enabling TCP window scaling and timestamps
    Requires Administrator privileges.
.EXAMPLE
    .\scripts\tune-windows-sockets.ps1
#>

#Requires -RunAsAdministrator

Write-Host "=== Appointin Windows Socket Tuning ===" -ForegroundColor Cyan
Write-Host ""

# 1. Increase max user ports (ephemeral port range)
Write-Host "[1/4] Setting MaxUserPort to 65534..." -ForegroundColor Yellow
Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters" -Name "MaxUserPort" -Value 65534 -Type DWord -ErrorAction SilentlyContinue
Write-Host "  Done." -ForegroundColor Green

# 2. Reduce TIME_WAIT timeout (TcpTimedWaitDelay)
Write-Host "[2/4] Setting TcpTimedWaitDelay to 30 seconds (was 240)..." -ForegroundColor Yellow
Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters" -Name "TcpTimedWaitDelay" -Value 30 -Type DWord -ErrorAction SilentlyContinue
Write-Host "  Done." -ForegroundColor Green

# 3. Enable TCP keepalive by default (idle=60s, interval=10s, count=6)
Write-Host "[3/4] Setting TCP keepalive defaults..." -ForegroundColor Yellow
Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters" -Name "KeepAliveTime" -Value 60000 -Type DWord -ErrorAction SilentlyContinue
Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters" -Name "KeepAliveInterval" -Value 10000 -Type DWord -ErrorAction SilentlyContinue
Write-Host "  Done." -ForegroundColor Green

# 4. Enable TCP Auto-Tuning and Timestamps for high-throughput
Write-Host "[4/4] Enabling TCP Auto-Tuning..." -ForegroundColor Yellow
Set-NetTCPSetting -SettingName Internet -AutoTuningLevelLocal Normal -ErrorAction SilentlyContinue
Write-Host "  Done." -ForegroundColor Green

Write-Host ""
Write-Host "=== All settings applied ===" -ForegroundColor Cyan
Write-Host "A REBOOT IS REQUIRED for changes to take effect." -ForegroundColor Red
Write-Host ""
Write-Host "To verify after reboot:" -ForegroundColor Yellow
Write-Host "  netsh int tcp show global"
Write-Host "  Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters' | Select MaxUserPort, TcpTimedWaitDelay"
