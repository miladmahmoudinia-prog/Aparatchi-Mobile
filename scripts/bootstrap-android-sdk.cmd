@echo off
setlocal EnableDelayedExpansion

set "PLATFORM_TARGET=%ANDROID_HOME%\platforms\android-36"
set "BUILD36_TARGET=%ANDROID_HOME%\build-tools\36.0.0"
set "BUILD35_TARGET=%ANDROID_HOME%\build-tools\35.0.0"

set "PLATFORM_ZIP=%TOOL_ROOT%\downloads\platform-36_r02.zip"
set "BUILD36_ZIP=%TOOL_ROOT%\downloads\build-tools_r36_windows.zip"
set "BUILD35_ZIP=%TOOL_ROOT%\downloads\build-tools_r35_windows.zip"

set "PLATFORM_SIZE=65878410"
set "PLATFORM_SHA1=2c1a80dd4d9f7d0e6dd336ec603d9b5c55a6f576"
set "BUILD36_SIZE=58699878"
set "BUILD36_SHA1=f16ccffd34de8790dede813a6c7d8e2c11a27b50"
set "BUILD35_SIZE=59878107"
set "BUILD35_SHA1=af059bb67cf7786f45ee0db85e2d24985df1b4b6"

set "PLATFORM_URL=https://redirector.gvt1.com/edgedl/android/repository/platform-36_r02.zip"
set "BUILD36_URL=https://redirector.gvt1.com/edgedl/android/repository/build-tools_r36_windows.zip"
set "BUILD35_URL=https://redirector.gvt1.com/edgedl/android/repository/build-tools_r35_windows.zip"

if not exist "%TOOL_ROOT%\downloads" mkdir "%TOOL_ROOT%\downloads"

if not exist "%PLATFORM_TARGET%\android.jar" call :reuse_platform
if errorlevel 1 exit /b %errorlevel%
if not exist "%PLATFORM_TARGET%\android.jar" call :download_platform
if errorlevel 1 exit /b %errorlevel%

if not exist "%BUILD36_TARGET%\aapt2.exe" call :reuse_build_tools 36.0.0 "%BUILD36_TARGET%"
if errorlevel 1 exit /b %errorlevel%
if not exist "%BUILD36_TARGET%\aapt2.exe" call :download_build_tools "%BUILD36_ZIP%" "%BUILD36_SIZE%" "%BUILD36_SHA1%" "%BUILD36_URL%" "36.0.0" "%BUILD36_TARGET%" "extract-build-tools-36"
if errorlevel 1 exit /b %errorlevel%

if not exist "%BUILD35_TARGET%\aapt2.exe" call :reuse_build_tools 35.0.0 "%BUILD35_TARGET%"
if errorlevel 1 exit /b %errorlevel%
if not exist "%BUILD35_TARGET%\aapt2.exe" call :download_build_tools "%BUILD35_ZIP%" "%BUILD35_SIZE%" "%BUILD35_SHA1%" "%BUILD35_URL%" "35.0.0" "%BUILD35_TARGET%" "extract-build-tools-35"
if errorlevel 1 exit /b %errorlevel%

goto sdk_ready

:reuse_platform
set "PLATFORM_SRC="
for /d %%U in ("C:\Users\*") do if not defined PLATFORM_SRC if exist "%%~fU\AppData\Local\Android\Sdk\platforms\android-36\android.jar" set "PLATFORM_SRC=%%~fU\AppData\Local\Android\Sdk\platforms\android-36"
if not defined PLATFORM_SRC if exist "C:\Android\Sdk\platforms\android-36\android.jar" set "PLATFORM_SRC=C:\Android\Sdk\platforms\android-36"
if not defined PLATFORM_SRC exit /b 0
echo Reusing Android platform 36 from !PLATFORM_SRC!
call :copy_tree "!PLATFORM_SRC!" "%PLATFORM_TARGET%"
exit /b !errorlevel!

:reuse_build_tools
set "REUSE_VERSION=%~1"
set "REUSE_TARGET=%~2"
set "BUILD_SRC="
for /d %%U in ("C:\Users\*") do if not defined BUILD_SRC if exist "%%~fU\AppData\Local\Android\Sdk\build-tools\!REUSE_VERSION!\aapt2.exe" set "BUILD_SRC=%%~fU\AppData\Local\Android\Sdk\build-tools\!REUSE_VERSION!"
if not defined BUILD_SRC if exist "C:\Android\Sdk\build-tools\!REUSE_VERSION!\aapt2.exe" set "BUILD_SRC=C:\Android\Sdk\build-tools\!REUSE_VERSION!"
if not defined BUILD_SRC exit /b 0
echo Reusing Android build-tools !REUSE_VERSION! from !BUILD_SRC!
call :copy_tree "!BUILD_SRC!" "!REUSE_TARGET!"
exit /b !errorlevel!

:download_platform
call :ensure_zip "%PLATFORM_ZIP%" "%PLATFORM_SIZE%" "%PLATFORM_SHA1%" "%PLATFORM_URL%" "Android SDK Platform 36"
if errorlevel 1 exit /b !errorlevel!
set "PLATFORM_TMP=%TOOL_ROOT%\extract-platform-36"
if exist "!PLATFORM_TMP!" rmdir /s /q "!PLATFORM_TMP!"
mkdir "!PLATFORM_TMP!" || exit /b 34
tar.exe -xf "%PLATFORM_ZIP%" -C "!PLATFORM_TMP!" || exit /b 35
pushd "!PLATFORM_TMP!" || exit /b 36
set "PLATFORM_JAR="
for /f "delims=" %%F in ('dir /s /b android.jar 2^>nul') do if not defined PLATFORM_JAR set "PLATFORM_JAR=%%F"
popd
if not defined PLATFORM_JAR (
  echo ERROR: android.jar was not found after extracting Platform 36.
  dir /s /b "!PLATFORM_TMP!"
  exit /b 36
)
for %%F in ("!PLATFORM_JAR!") do set "PLATFORM_SRC=%%~dpF"
if "!PLATFORM_SRC:~-1!"=="\" set "PLATFORM_SRC=!PLATFORM_SRC:~0,-1!"
call :copy_tree "!PLATFORM_SRC!" "%PLATFORM_TARGET%"
if errorlevel 1 exit /b !errorlevel!
rmdir /s /q "!PLATFORM_TMP!"
exit /b 0

:download_build_tools
set "BT_ZIP=%~1"
set "BT_SIZE=%~2"
set "BT_SHA1=%~3"
set "BT_URL=%~4"
set "BT_VERSION=%~5"
set "BT_TARGET=%~6"
set "BT_TMP=%TOOL_ROOT%\%~7"
call :ensure_zip "!BT_ZIP!" "!BT_SIZE!" "!BT_SHA1!" "!BT_URL!" "Android Build-Tools !BT_VERSION!"
if errorlevel 1 exit /b !errorlevel!
if exist "!BT_TMP!" rmdir /s /q "!BT_TMP!"
mkdir "!BT_TMP!" || exit /b 44
tar.exe -xf "!BT_ZIP!" -C "!BT_TMP!" || exit /b 45
pushd "!BT_TMP!" || exit /b 46
set "AAPT2_FILE="
for /f "delims=" %%F in ('dir /s /b aapt2.exe 2^>nul') do if not defined AAPT2_FILE set "AAPT2_FILE=%%F"
popd
if not defined AAPT2_FILE (
  echo ERROR: aapt2.exe was not found after extracting Build-Tools !BT_VERSION!.
  dir /s /b "!BT_TMP!"
  exit /b 46
)
for %%F in ("!AAPT2_FILE!") do set "BUILD_SRC=%%~dpF"
if "!BUILD_SRC:~-1!"=="\" set "BUILD_SRC=!BUILD_SRC:~0,-1!"
call :copy_tree "!BUILD_SRC!" "!BT_TARGET!"
if errorlevel 1 exit /b !errorlevel!
rmdir /s /q "!BT_TMP!"
exit /b 0

:ensure_zip
set "ZIP_PATH=%~1"
set "ZIP_SIZE=%~2"
set "ZIP_SHA1=%~3"
set "ZIP_URL=%~4"
set "ZIP_LABEL=%~5"
set "ZIP_OK=0"
if exist "!ZIP_PATH!" (
  for %%F in ("!ZIP_PATH!") do if "%%~zF"=="!ZIP_SIZE!" (
    certutil -hashfile "!ZIP_PATH!" SHA1 | findstr /I "!ZIP_SHA1!" >nul 2>&1
    if not errorlevel 1 set "ZIP_OK=1"
  )
)
if "!ZIP_OK!"=="1" (
  echo Using cached !ZIP_LABEL! archive.
  exit /b 0
)
if exist "!ZIP_PATH!" del /q "!ZIP_PATH!"
type nul > "!ZIP_PATH!"
echo Downloading !ZIP_LABEL! once...
curl.exe -fL -C - --retry 8 --retry-delay 5 --retry-all-errors --connect-timeout 20 --max-time 3600 -o "!ZIP_PATH!" "!ZIP_URL!" || exit /b 60
for %%F in ("!ZIP_PATH!") do if not "%%~zF"=="!ZIP_SIZE!" exit /b 61
certutil -hashfile "!ZIP_PATH!" SHA1 | findstr /I "!ZIP_SHA1!" >nul 2>&1 || exit /b 62
exit /b 0

:copy_tree
set "COPY_SRC=%~1"
set "COPY_DST=%~2"
if not exist "!COPY_SRC!" exit /b 70
for %%D in ("!COPY_DST!\..") do if not exist "%%~fD" mkdir "%%~fD"
if exist "!COPY_DST!" rmdir /s /q "!COPY_DST!"
mkdir "!COPY_DST!" || exit /b 71
xcopy "!COPY_SRC!\*" "!COPY_DST!\" /E /I /H /Y >nul
if errorlevel 1 exit /b 72
exit /b 0

:sdk_ready
if not exist "%PLATFORM_TARGET%\android.jar" (
  echo ERROR: Android platform 36 is still missing.
  exit /b 50
)
if not exist "%BUILD36_TARGET%\aapt2.exe" (
  echo ERROR: Android build-tools 36.0.0 are still missing.
  exit /b 51
)
if not exist "%BUILD35_TARGET%\aapt2.exe" (
  echo ERROR: Android build-tools 35.0.0 are still missing.
  exit /b 52
)
echo Android platform 36 plus build-tools 36.0.0 and 35.0.0 are persistent and ready.
exit /b 0
