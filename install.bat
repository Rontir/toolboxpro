@echo off
chcp 65001 >nul
title Toolbox - Instalacja i uruchomienie
color 0A

echo.
echo ============================================================
echo           TOOLBOX - INSTALACJA I URUCHOMIENIE
echo ============================================================
echo.

:: Sprawdź Node.js
echo [1/4] Sprawdzam Node.js...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ❌ Node.js nie jest zainstalowany!
    echo.
    echo Pobierz Node.js z: https://nodejs.org/
    echo Wybierz wersję LTS i zainstaluj.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do echo    ✅ Node.js: %%i

:: Sprawdź Python
echo [2/4] Sprawdzam Python...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ❌ Python nie jest zainstalowany!
    echo.
    echo Pobierz Python z: https://python.org/downloads/
    echo Podczas instalacji zaznacz "Add Python to PATH"
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('python --version') do echo    ✅ %%i

echo.
echo ============================================================
echo           INSTALACJA ZALEŻNOŚCI
echo ============================================================
echo.

:: Instalacja npm
echo [3/4] Instaluję zależności Node.js (może potrwać 1-2 min)...
cd /d "%~dp0"
call npm install --silent
if %errorlevel% neq 0 (
    echo ❌ Błąd instalacji npm!
    pause
    exit /b 1
)
echo    ✅ Zależności Node.js zainstalowane

:: Instalacja pip
echo [4/4] Instaluję zależności Python...
cd /d "%~dp0backend"
pip install -r requirements.txt --quiet
if %errorlevel% neq 0 (
    echo ❌ Błąd instalacji pip!
    pause
    exit /b 1
)
echo    ✅ Zależności Python zainstalowane

echo.
echo ============================================================
echo           INSTALACJA ZAKOŃCZONA POMYŚLNIE!
echo ============================================================
echo.
echo Teraz możesz uruchomić aplikację za pomocą: start.bat
echo.
pause
