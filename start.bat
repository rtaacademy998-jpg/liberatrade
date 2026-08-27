@echo off
REM Libera Analysts - start the site and the live quote fetcher together.
REM No API key needed: the default feed (Yahoo) is keyless.
cd /d "%~dp0"

echo Starting Libera Analysts...
start "Libera - web server" cmd /k python serve.py
timeout /t 2 /nobreak >nul
start "Libera - quotes (5 min)" cmd /k python -u tools\fetch_quotes.py
echo.
echo   Web server : http://localhost:8080
echo   Quotes     : refreshing every 5 minutes (19 symbols, no API key)
echo.
echo Close both windows to stop.
