@echo off
setlocal EnableDelayedExpansion
set "VER=27.1.12297006"
set "TARGET=%ANDROID_HOME%\ndk\%VER%"
set "SRC="
set "ZIP=%TOOL_ROOT%\downloads\android-ndk-r27b-windows.zip"
set "SHA1=3bb7efc850cd0af7707854b7e0d5c3b6a7153703"
set "EXPECTED_SIZE=781495902"
set "PRIMARY_URL=https://redirector.gvt1.com/edgedl/android/repository/android-ndk-r27b-windows.zip"
set "FALLBACK_URL=https://dl.google.com/android/repository/android-ndk-r27b-windows.zip"

if exist "%TARGET%\source.properties" set "SRC=%TARGET%"
if not defined SRC for /d %%U in ("C:\Users\*") do if not defined SRC if exist "%%~fU\AppData\Local\Android\Sdk\ndk\%VER%\source.properties" set "SRC=%%~fU\AppData\Local\Android\Sdk\ndk\%VER%"
if not defined SRC if exist "C:\Android\Sdk\ndk\%VER%\source.properties" set "SRC=C:\Android\Sdk\ndk\%VER%"
if not defined SRC for /d %%E in ("C:\Program Files\Unity\Hub\Editor\*") do if not defined SRC if exist "%%~fE\Editor\Data\PlaybackEngines\AndroidPlayer\NDK\source.properties" (
  findstr /I /C:"Pkg.Revision = %VER%" "%%~fE\Editor\Data\PlaybackEngines\AndroidPlayer\NDK\source.properties" >nul 2>&1 && set "SRC=%%~fE\Editor\Data\PlaybackEngines\AndroidPlayer\NDK"
)
if not defined SRC if exist "%TOOL_ROOT%\android-ndk-r27b\source.properties" set "SRC=%TOOL_ROOT%\android-ndk-r27b"

if not defined SRC (
  if not exist "%TOOL_ROOT%\downloads" mkdir "%TOOL_ROOT%\downloads"

  if exist "!ZIP!" (
    for %%F in ("!ZIP!") do set "CURRENT_SIZE=%%~zF"
    if "!CURRENT_SIZE!"=="!EXPECTED_SIZE!" (
      certutil -hashfile "!ZIP!" SHA1 | findstr /I "!SHA1!" >nul 2>&1
      if errorlevel 1 del /q "!ZIP!"
    ) else if !CURRENT_SIZE! GTR !EXPECTED_SIZE! (
      del /q "!ZIP!"
    )
  )

  if not exist "!ZIP!" (
    type nul > "!ZIP!"
  )

  echo NDK r27b is not local. Downloading once from the working Google CDN route...
  curl.exe -fL -C - --retry 8 --retry-delay 5 --retry-all-errors --connect-timeout 20 --max-time 7200 -o "!ZIP!" "!PRIMARY_URL!"
  if errorlevel 1 (
    echo Primary Google CDN route failed. Trying dl.google.com fallback...
    del /q "!ZIP!" >nul 2>&1
    curl.exe -fL --retry 4 --retry-delay 5 --retry-all-errors --connect-timeout 20 --max-time 7200 -o "!ZIP!" "!FALLBACK_URL!" || exit /b 11
  )

  for %%F in ("!ZIP!") do set "CURRENT_SIZE=%%~zF"
  if not "!CURRENT_SIZE!"=="!EXPECTED_SIZE!" (
    echo ERROR: NDK download size mismatch. Got !CURRENT_SIZE!, expected !EXPECTED_SIZE!.
    exit /b 12
  )
  certutil -hashfile "!ZIP!" SHA1 | findstr /I "!SHA1!" >nul 2>&1 || (
    echo ERROR: NDK checksum mismatch.
    exit /b 13
  )

  if exist "%TOOL_ROOT%\android-ndk-r27b" rmdir /s /q "%TOOL_ROOT%\android-ndk-r27b"
  tar.exe -xf "!ZIP!" -C "%TOOL_ROOT%" || exit /b 14
  if exist "%TOOL_ROOT%\android-ndk-r27b\source.properties" set "SRC=%TOOL_ROOT%\android-ndk-r27b"
)

if not defined SRC (
  echo ERROR: NDK %VER% could not be prepared.
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
