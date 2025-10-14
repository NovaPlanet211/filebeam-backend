@echo off
echo Uruchamiam FileBeam backend...

REM Przejście do folderu backendu
cd /d C:\Users\tatam\filebeam-backend

REM Uruchomienie backendu w nowym oknie
start cmd /k "node server.js"

REM Poczekaj chwilę, by backend się uruchomił
timeout /t 2 >nul

REM Otwórz przeglądarkę z listą plików
start http://localhost:3000/files/dom

echo Gotowe! Backend działa, przeglądarka otwarta.
