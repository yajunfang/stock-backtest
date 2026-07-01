@echo off
echo ========================================
echo   股票策略历史回测系统
echo ========================================
echo.
echo 正在启动本地服务器...
echo 打开浏览器访问: http://localhost:8080
echo 按 Ctrl+C 停止服务器
echo ========================================
echo.
cd /d "%~dp0"
python -m http.server 8080
pause
