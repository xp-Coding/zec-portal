@echo off
title ZEC Portal API Server
echo ========================================================
echo        Zakariya Educational Complex (ZEC)
echo             ZEC Portal - API Server
echo ========================================================
echo.
echo Starting ZEC Portal Server on port 4000...
echo Connected to Turso cloud database.
echo.
cd /d "%~dp0"
npm run server:dev
pause
