@echo off
rem Builds the Calorie Compass Android app (signed APK) on this PC. Double-click this file.
rem The work is done by scripts\android\build-android.mjs; details go to build-android.log.
rem The first run downloads about 1 GB of build tools into %LOCALAPPDATA%\CalorieCompassAndroid.
rem Nothing is uploaded and nothing is pushed to GitHub.
rem Keep this file ASCII-only with CRLF line endings: cmd.exe misreads anything else.
setlocal
cd /d "%~dp0"
title Calorie Compass - Android build
echo ==== Calorie Compass: build the Android app ====
echo The first run downloads build tools and takes 15 to 30 minutes; later runs take a few minutes.
echo Please keep this window open. Details are written to build-android.log.
echo.
where node >nul 2>&1
if errorlevel 1 goto nonode
node scripts\android\build-android.mjs %*
set "RESULT=%ERRORLEVEL%"
echo.
if "%RESULT%"=="0" (
  echo All done. The APK is in the release-...-android folder shown above.
) else (
  echo The build stopped. See the message above and build-android.log.
)
echo You can close this window.
pause >nul
exit /b %RESULT%

:nonode
echo Node.js was not found. Install Node.js 22 or newer from https://nodejs.org and run this again.
pause >nul
exit /b 1
