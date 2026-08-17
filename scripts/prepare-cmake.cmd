@echo off
setlocal EnableDelayedExpansion
set "TARGET=%ANDROID_HOME%\cmake\3.22.1"
set "SRC="

if exist "%TARGET%\bin\cmake.exe" set "SRC=%TARGET%"
if not defined SRC for /d %%U in ("C:\Users\*") do if not defined SRC if exist "%%~fU\AppData\Local\Android\Sdk\cmake\3.22.1\bin\cmake.exe" set "SRC=%%~fU\AppData\Local\Android\Sdk\cmake\3.22.1"
if not defined SRC if exist "C:\Android\Sdk\cmake\3.22.1\bin\cmake.exe" set "SRC=C:\Android\Sdk\cmake\3.22.1"
if not defined SRC for /d %%E in ("C:\Program Files\Unity\Hub\Editor\*") do if not defined SRC if exist "%%~fE\Editor\Data\PlaybackEngines\AndroidPlayer\SDK\cmake\3.22.1\bin\cmake.exe" set "SRC=%%~fE\Editor\Data\PlaybackEngines\AndroidPlayer\SDK\cmake\3.22.1"
if not defined SRC if exist "%TOOL_ROOT%\cmake-3.22.1-windows-x86_64\bin\cmake.exe" set "SRC=%TOOL_ROOT%\cmake-3.22.1-windows-x86_64"

if not defined SRC (
  echo Bootstrapping CMake 3.22.1 from Kitware GitHub once...
  if not exist "%TOOL_ROOT%\downloads" mkdir "%TOOL_ROOT%\downloads"
  set "ZIP=%TOOL_ROOT%\downloads\cmake-3.22.1-windows-x86_64.zip"
  if not exist "!ZIP!" curl.exe -fL --retry 3 --retry-delay 3 -o "!ZIP!" "https://github.com/Kitware/CMake/releases/download/v3.22.1/cmake-3.22.1-windows-x86_64.zip" || exit /b 30
  certutil -hashfile "!ZIP!" SHA256 | findstr /I "35fbbb7d9ffa491834bbc79cdfefc6c360088a3c9bf55c29d111a5afa04cdca3" >nul 2>&1 || exit /b 31
  tar.exe -xf "!ZIP!" -C "%TOOL_ROOT%" || exit /b 32
  set "SRC=%TOOL_ROOT%\cmake-3.22.1-windows-x86_64"
)

if not exist "!SRC!\bin\ninja.exe" (
  echo Adding Ninja to cached CMake...
  curl.exe -fL --retry 3 --retry-delay 3 -o "%RUNNER_TEMP%\ninja-win.zip" "https://github.com/ninja-build/ninja/releases/download/v1.10.2/ninja-win.zip" || exit /b 33
  tar.exe -xf "%RUNNER_TEMP%\ninja-win.zip" -C "!SRC!\bin" || exit /b 34
)

if /I not "!SRC!"=="%TARGET%" (
  if not exist "%ANDROID_HOME%\cmake" mkdir "%ANDROID_HOME%\cmake"
  if exist "%TARGET%" rmdir "%TARGET%" >nul 2>&1
  mklink /J "%TARGET%" "!SRC!" >nul 2>&1
  if errorlevel 1 (
    robocopy "!SRC!" "%TARGET%" /E /NFL /NDL /NJH /NJS /NP
    if errorlevel 8 exit /b 35
  )
)
if not exist "%TARGET%\bin\cmake.exe" exit /b 36
if not exist "%TARGET%\bin\ninja.exe" exit /b 37
echo CMake/Ninja ready: %TARGET%

if not exist "%ANDROID_HOME%\platforms\android-36\android.jar" (
  echo ERROR: Android platform 36 is missing from %ANDROID_HOME%.
  exit /b 40
)
if not exist "%ANDROID_HOME%\build-tools\36.0.0\aapt2.exe" (
  echo ERROR: Android build-tools 36.0.0 are missing from %ANDROID_HOME%.
  exit /b 41
)
echo Android platform 36 and build-tools 36.0.0 are ready.
endlocal
