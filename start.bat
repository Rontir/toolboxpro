@echo off
chcp 65001 >nul
title Toolbox - Uruchomienie
color 0A

echo.
echo ============================================================
echo               TOOLBOX - URUCHAMIANIE
echo ============================================================
echo.

cd /d "%~dp0"

:: Sprawdź czy node_modules istnieje
if not exist "node_modules" (
    echo ❌ Zależności nie są zainstalowane!
    echo.
    echo Uruchom najpierw: install.bat
    echo.
    pause
    exit /b 1
)

echo Uruchamiam serwery...
echo.
echo    🌐 Frontend: http://localhost:3000
echo    🔧 Backend:  http://localhost:8000
echo.
echo ============================================================
echo    Aby zatrzymać - zamknij to okno lub naciśnij Ctrl+C
echo ============================================================
echo.

:: Uruchom backend w nowym oknie
start "Toolbox Backend" cmd /c "cd /d "%~dp0backend" && python server.py"

:: Poczekaj chwilę na uruchomienie backendu
timeout /t 2 /nobreak >nul

:: Uruchom frontend
echo Uruchamiam frontend...
call npm run dev

:: Jeśli frontend się zakończy, zamknij też backend
taskkill /FI "WINDOWTITLE eq Toolbox Backend" /F >nul 2>&1
