@echo off
title Smart Traffic - Flask Backend
echo.
echo ============================================================
echo  SMART CRASH ^& TRAFFIC MANAGEMENT SYSTEM - Flask Backend
echo ============================================================
echo.
echo  Starting Flask API on http://127.0.0.1:5000 ...
echo  Press Ctrl+C to stop.
echo.
cd /d "%~dp0"
python app.py
pause
