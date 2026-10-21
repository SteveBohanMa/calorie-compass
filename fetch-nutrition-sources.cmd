@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set "LOG=%~dp0fetch-nutrition-sources.log"
echo ==== 燃卡快查：下载营养数据源 ====
echo 会下载 USDA（约 10 MB）和日本食品标准成分表（约 2 MB），放到 data-sources\raw 文件夹。
echo 一般一两分钟就好，请不要关闭这个窗口。
echo.
node scripts\fetch-nutrition-sources.mjs > "%LOG%" 2>&1
if errorlevel 1 goto fail
type "%LOG%"
echo.
echo 全部完成！
pause
exit /b 0

:fail
type "%LOG%"
echo.
echo 有文件没下载成功，记录在 fetch-nutrition-sources.log。
pause
exit /b 1
