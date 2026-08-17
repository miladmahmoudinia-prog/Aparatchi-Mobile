@echo off
setlocal EnableDelayedExpansion
set "VER=27.1.12297006"
set "TARGET=%ANDROID_HOME%\ndk\%VER%"
set "SRC="

if exist "%TARGET%\source.properties" set "SRC=%TARGET%"
if not defined SRC for /d %%U in ("C:\Users\*") do if not defined SRC if exist "%%~fU\AppData\Local\Android\Sdk\ndk\%VER%\source.properties" set "SRC=%%~fU\AppData\Local\Android\Sdk\ndk\%VER%"
if not defined SRC if exist "C:\Android\Sdk\ndk\%VER%\source.properties" set "SRC=C:\Android\Sdk\ndk\%VER%"
if not defined SRC for /d %%E in ("C:\Program Files\Unity\Hub\Editor\*") do if not defined SRC if exist "%%~fE\Editor\Data\PlaybackEngines\AndroidPlayer\NDK\source.properties" (
  findstr /I /C:"Pkg.Revision = %VER%" "%%~fE\Editor\Data\PlaybackEngines\AndroidPlayer\NDK\source.properties" >nul 2>&1 && set "SRC=%%~fE\Editor\Data\PlaybackEngines\AndroidPlayer\NDK"
)
if not defined SRC if exist "%TOOL_ROOT%\android-ndk-r27b\source.properties" set "SRC=%TOOL_ROOT%\android-ndk-r27b"

if not defined SRC (
  echo NDK r27b is not local. Checking official Google download...
  curl.exe -fsIL --connect-timeout 10 --max-time 25 "https://dl.google.com/android/repository/android-ndk-r27b-windows.zip" >nul 2>&1
  if not errorlevel 1 (
    if not exist "%TOOL_ROOT%\downloads" mkdir "%TOOL_ROOT%\downloads"
    set "ZIP=%TOOL_ROOT%\downloads\android-ndk-r27b-windows.zip"
    if exist "!ZIP!" certutil -hashfile "!ZIP!" SHA1 | findstr /I "3bb7efc850cd0af7707854b7e0d5c3b6a7153703" >nul 2>&1 || del /q "!ZIP!"
    if not exist "!ZIP!" curl.exe -fL --retry 3 --retry-delay 5 --connect-timeout 15 --max-time 1800 -o "!ZIP!" "https://dl.google.com/android/repository/android-ndk-r27b-windows.zip" || exit /b 11
    certutil -hashfile "!ZIP!" SHA1 | findstr /I "3bb7efc850cd0af7707854b7e0d5c3b6a7153703" >nul 2>&1 || exit /b 12
    if exist "%TOOL_ROOT%\android-ndk-r27b" rmdir /s /q "%TOOL_ROOT%\android-ndk-r27b"
    tar.exe -xf "!ZIP!" -C "%TOOL_ROOT%" || exit /b 13
    if exist "%TOOL_ROOT%\android-ndk-r27b\source.properties" set "SRC=%TOOL_ROOT%\android-ndk-r27b"
  )
)

if not defined SRC (
  echo ERROR: NDK %VER% is missing and Google is unreachable.
  echo Checked runner SDK, user Android SDKs, C:\Android\Sdk, Unity Hub and runner cache.
  echo Stopping before npm and Gradle to avoid another long failed build.
  exit /b 20
)
findstr /I /C:"Pkg.Revision = %VER%" "!SRC!\source.properties" >nul 2>&1 || exit /b 21
echo Exact NDK found: !SRC!

if /I not "!SRC!"=="%TARGET%" (
  if not exist "%ANDROID_HOME%\ndk" mkdir "%ANDROID_HOME%\ndk"
  if exist "%TARGET%" rmdir "%TARGET%" >nul 2>&1
  mklink /J "%TARGET%" "!SRC!" >nul 2>&1
  if errorlevel 1 (
    echo Junction unavailable; copying NDK once...
    robocopy "!SRC!" "%TARGET%" /E /NFL /NDL /NJH /NJS /NP
    if errorlevel 8 exit /b 22
  )
)
if not exist "%TARGET%\build\cmake\android.toolchain.cmake" exit /b 23
echo NDK ready: %TARGET%
endlocal
