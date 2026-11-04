@echo off
:: Double-click or run — prompts for Administrator, opens Windows Firewall port 4002 for Pi
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting Administrator...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo Adding firewall rule: HMI32 Backend TCP 4002 inbound...
netsh advfirewall firewall delete rule name="HMI32 Backend 4002" >nul 2>&1
netsh advfirewall firewall add rule name="HMI32 Backend 4002" dir=in action=allow protocol=TCP localport=4002 profile=any

if %errorLevel% equ 0 (
    echo.
    echo SUCCESS - Pi can reach this PC on port 4002
    echo Pi test:
    echo   curl -v --connect-timeout 10 http://192.168.1.71:4002/api/health
    echo   curl -v --connect-timeout 10 http://100.90.128.80:4002/api/health
) else (
    echo FAILED - error %errorLevel%
)

echo.
pause
