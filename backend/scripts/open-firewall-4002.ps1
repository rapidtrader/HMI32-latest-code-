# MUST run: Right-click PowerShell -> Run as administrator
#   cd "C:\ashutosh\HMI32\complete working code hmi32\backend\scripts"
#   Set-ExecutionPolicy -Scope Process Bypass -Force
#   .\open-firewall-4002.ps1

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdmin) {
    Write-Host "ERROR: Run this script in Administrator PowerShell (Access denied otherwise)." -ForegroundColor Red
    Write-Host 'Right-click PowerShell -> Run as administrator, then run this script again.'
    Write-Host ""
    Write-Host "Or paste this ONE line in Admin PowerShell:"
    Write-Host 'netsh advfirewall firewall add rule name="HMI32 Backend 4002" dir=in action=allow protocol=TCP localport=4002' -ForegroundColor Yellow
    exit 1
}

$ruleName = "HMI32 Backend TCP 4002"
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Firewall rule already exists: $ruleName"
} else {
    try {
        New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort 4002 -Profile Any | Out-Null
        Write-Host "OK: Created firewall rule (all profiles) for TCP 4002 inbound."
    } catch {
        Write-Host "New-NetFirewallRule failed: $($_.Exception.Message)" -ForegroundColor Red
        netsh advfirewall firewall add rule name="HMI32 Backend 4002" dir=in action=allow protocol=TCP localport=4002
        if ($LASTEXITCODE -eq 0) { Write-Host "OK: Rule added via netsh." } else { exit 1 }
    }
}

Write-Host ""
Write-Host "Pi test:"
Write-Host '  curl -v --connect-timeout 10 http://192.168.1.71:4002/api/health'
Write-Host '  curl -v --connect-timeout 10 http://100.90.128.80:4002/api/health'
Write-Host ""
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' } |
    ForEach-Object { Write-Host "  http://$($_.IPAddress):4002" }
