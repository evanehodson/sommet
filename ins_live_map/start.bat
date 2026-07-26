@echo off
cd /d "%~dp0"
echo ========================================
echo   Live Race Map - Starting...
echo ========================================
echo.

REM Check if cloudflared is installed
where cloudflared >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [!] cloudflared not found.
    echo     Install it: winget install cloudflare.cloudflared
    echo     Or download from: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
    echo.
    pause
    exit /b 1
)

echo [1/2] Starting local server on port 3000...
start "LiveMap-Server" node server.js

REM Give the server a moment to start
timeout /t 2 /nobreak >nul

echo [2/2] Starting Cloudflare tunnel...
echo.
echo ========================================
echo   OPEN THESE URLs ON YOUR PHONE:
echo ========================================
echo.
echo   Map:     http://localhost:3000
echo   Tracker: (see tunnel URL below)
echo.
echo ========================================
echo.

cloudflared tunnel --url http://127.0.0.1:3000
