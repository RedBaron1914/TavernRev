@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"

set "FRONTEND_DIST=%ROOT_DIR%\dist"
set "TAURI_DIR=%ROOT_DIR%\src-tauri"
set "MANIFEST_PATH=%TAURI_DIR%\Cargo.toml"
set "OUTPUT_BIN=%TAURI_DIR%\target\release\tavernrev.exe"
set "MSI_OUTPUT=%TAURI_DIR%\target\release\bundle\msi\TavernRev_1.0.1_x64_en-US.msi"
set "NSIS_OUTPUT=%TAURI_DIR%\target\release\bundle\nsis\TavernRev_1.0.1_x64-setup.exe"
set "LOG_DIR=%ROOT_DIR%\build-logs"
set "LOG_FILE=%LOG_DIR%\compile-bin.log"
set "PAUSE_AT_END=1"

if /I "%~1"=="--no-pause" set "PAUSE_AT_END=0"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" >nul 2>nul
break > "%LOG_FILE%"

call :banner

call :step 5 "Checking tools"
call :require_cmd npm "Node.js / npm not found. Install Node.js and try again."
if errorlevel 1 (
  call :fail 1
  exit /b 1
)
call :require_cmd cargo "Rust / cargo not found. Install Rust toolchain and try again."
if errorlevel 1 (
  call :fail 1
  exit /b 1
)

if not exist "%MANIFEST_PATH%" (
  echo [ERROR] File not found: "%MANIFEST_PATH%".
  >> "%LOG_FILE%" echo [ERROR] File not found: "%MANIFEST_PATH%".
  call :fail 1
  exit /b 1
)

call :step 15 "Checking dependencies"
if not exist "%ROOT_DIR%\node_modules" (
  echo [INFO] node_modules not found. Running npm install...
  pushd "%ROOT_DIR%"
  call npm install
  set "BUILD_EXIT=%ERRORLEVEL%"
  popd
  >> "%LOG_FILE%" echo npm install exit code: %BUILD_EXIT%
  if not "%BUILD_EXIT%"=="0" (
    echo [ERROR] npm install failed.
    >> "%LOG_FILE%" echo [ERROR] npm install failed.
    call :fail %BUILD_EXIT%
    exit /b %BUILD_EXIT%
  )
) else (
  echo [OK] node_modules already exists.
  >> "%LOG_FILE%" echo [OK] node_modules already exists.
)

call :step 35 "Building frontend (Vite)"
pushd "%ROOT_DIR%"
call npm run build
set "BUILD_EXIT=%ERRORLEVEL%"
if not "%BUILD_EXIT%"=="0" (
  popd
  echo [ERROR] Frontend build failed.
  >> "%LOG_FILE%" echo [ERROR] Frontend build failed.
  >> "%LOG_FILE%" echo npm run build exit code: %BUILD_EXIT%
  call :fail %BUILD_EXIT%
  exit /b %BUILD_EXIT%
)
popd
>> "%LOG_FILE%" echo npm run build exit code: %BUILD_EXIT%

if not exist "%FRONTEND_DIST%" (
  echo [ERROR] dist folder was not created after npm run build.
  >> "%LOG_FILE%" echo [ERROR] dist folder was not created after npm run build.
  call :fail 1
  exit /b 1
)

call :step 70 "Building installer bundle (Tauri)"
pushd "%ROOT_DIR%"
call npm run tauri build
set "BUILD_EXIT=%ERRORLEVEL%"
popd
>> "%LOG_FILE%" echo npm run tauri build exit code: %BUILD_EXIT%

if not "%BUILD_EXIT%"=="0" (
  echo [ERROR] Installer build failed.
  echo [INFO] Check compiler output above.
  >> "%LOG_FILE%" echo [ERROR] Installer build failed with code %BUILD_EXIT%.
  call :fail %BUILD_EXIT%
  exit /b %BUILD_EXIT%
)

call :step 100 "Done"
if exist "%MSI_OUTPUT%" (
  echo [OK] MSI installer built: "%MSI_OUTPUT%"
  >> "%LOG_FILE%" echo [OK] MSI installer built: "%MSI_OUTPUT%"
) else (
  echo [WARN] MSI installer was not found at expected path.
  >> "%LOG_FILE%" echo [WARN] MSI installer not found: "%MSI_OUTPUT%"
)

if exist "%NSIS_OUTPUT%" (
  echo [OK] NSIS installer built: "%NSIS_OUTPUT%"
  >> "%LOG_FILE%" echo [OK] NSIS installer built: "%NSIS_OUTPUT%"
) else (
  echo [WARN] NSIS installer was not found at expected path.
  >> "%LOG_FILE%" echo [WARN] NSIS installer not found: "%NSIS_OUTPUT%"
)

if exist "%OUTPUT_BIN%" (
  echo [INFO] App binary: "%OUTPUT_BIN%"
  >> "%LOG_FILE%" echo [INFO] App binary: "%OUTPUT_BIN%"
)

echo [INFO] Build log: "%LOG_FILE%"
>> "%LOG_FILE%" echo [INFO] Build finished successfully.

call :finish 0

exit /b 0

:banner
echo ============================================
echo   TavernRev release build to installer
echo ============================================
echo Root: "%ROOT_DIR%"
echo Log : "%LOG_FILE%"
echo.
>> "%LOG_FILE%" echo ============================================
>> "%LOG_FILE%" echo TavernRev release installer build
>> "%LOG_FILE%" echo ============================================
>> "%LOG_FILE%" echo Root: "%ROOT_DIR%"
exit /b 0

:step
set "STEP_PERCENT=%~1"
set "STEP_LABEL=%~2"
echo.
echo [%STEP_PERCENT%%%] %STEP_LABEL%
echo --------------------------------------------
>> "%LOG_FILE%" echo.
>> "%LOG_FILE%" echo [%STEP_PERCENT%%%] %STEP_LABEL%
>> "%LOG_FILE%" echo --------------------------------------------
exit /b 0

:require_cmd
where %~1 >nul 2>nul
if errorlevel 1 (
  echo [ERROR] %~2
  >> "%LOG_FILE%" echo [ERROR] %~2
  exit /b 1
)
echo [OK] Found %~1
>> "%LOG_FILE%" echo [OK] Found %~1
exit /b 0

:fail
set "EXIT_CODE=%~1"
echo.
echo [FAILED] Exit code: %EXIT_CODE%
echo [INFO] Build log saved to: "%LOG_FILE%"
>> "%LOG_FILE%" echo [FAILED] Exit code: %EXIT_CODE%
>> "%LOG_FILE%" echo [INFO] Build log saved to: "%LOG_FILE%"
if "%PAUSE_AT_END%"=="1" pause
exit /b %EXIT_CODE%

:finish
set "EXIT_CODE=%~1"
echo.
echo [SUCCESS] Exit code: %EXIT_CODE%
>> "%LOG_FILE%" echo [SUCCESS] Exit code: %EXIT_CODE%
if "%PAUSE_AT_END%"=="1" pause
exit /b %EXIT_CODE%
