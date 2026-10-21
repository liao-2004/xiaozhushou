@echo off
chcp 65001 >nul
cd /d "C:\Users\801\Desktop\onOff"
echo 正在修复 electron...
taskkill /f /im electron.exe >nul 2>&1
timeout /t 1 /nobreak >nul
rmdir /s /q node_modules\electron 2>nul
call npm install electron
echo.
echo 修复完成，正在启动...
start "" "node_modules\electron\dist\electron.exe" .
