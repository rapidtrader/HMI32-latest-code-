# Run once as Administrator (right-click PowerShell → Run as administrator)
# Allows Pi / LAN to reach Node backend on port 4002
$ruleName = "HMI32 Backend TCP 4002"
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "Rule already exists: $ruleName"
} else {
  New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow `
    -Protocol TCP -LocalPort 4002 -Profile Any | Out-Null
  Write-Host "Created firewall rule: $ruleName"
}
Write-Host "Test from Pi: curl -v --connect-timeout 5 http://100.90.128.80:4002/api/health"
