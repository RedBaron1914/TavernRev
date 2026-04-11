@echo off
setlocal EnableExtensions

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"

set "BASE_BRANCH="
set "PR_TITLE=%~1"
set "PR_BODY_FILE=%~2"

pushd "%ROOT_DIR%" >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Failed to open project directory: "%ROOT_DIR%"
  exit /b 1
)

call :require_cmd git "Git not found in PATH."
if errorlevel 1 goto :fail

call :require_cmd gh "GitHub CLI not found in PATH."
if errorlevel 1 goto :fail

git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Current directory is not a git repository.
  goto :fail
)

gh auth status >nul 2>nul
if errorlevel 1 (
  echo [ERROR] GitHub CLI is not authenticated. Run: gh auth login
  goto :fail
)

for /f "usebackq delims=" %%i in (`git branch --show-current`) do set "CURRENT_BRANCH=%%i"
if not defined CURRENT_BRANCH (
  echo [ERROR] Failed to determine current branch.
  goto :fail
)

if /I "%CURRENT_BRANCH%"=="main" (
  echo [ERROR] Current branch is main. Switch to a feature branch first.
  goto :fail
)

if /I "%CURRENT_BRANCH%"=="master" (
  echo [ERROR] Current branch is master. Switch to a feature branch first.
  goto :fail
)

for /f "usebackq delims=" %%i in (`gh repo view --json defaultBranchRef --jq ".defaultBranchRef.name"`) do set "BASE_BRANCH=%%i"
if not defined BASE_BRANCH set "BASE_BRANCH=main"

if not defined PR_TITLE (
  set /p "PR_TITLE=PR title: "
)

if not defined PR_TITLE (
  echo [ERROR] PR title is required.
  goto :fail
)

echo.
echo [INFO] Current branch: %CURRENT_BRANCH%
echo [INFO] Base branch   : %BASE_BRANCH%

git ls-remote --exit-code --heads origin "%CURRENT_BRANCH%" >nul 2>nul
if errorlevel 1 (
  echo [INFO] Remote branch does not exist. Pushing with upstream...
  git push -u origin "%CURRENT_BRANCH%"
  if errorlevel 1 goto :fail
) else (
  echo [INFO] Pushing latest commits...
  git push origin "%CURRENT_BRANCH%"
  if errorlevel 1 goto :fail
)

gh pr view "%CURRENT_BRANCH%" >nul 2>nul
if not errorlevel 1 (
  echo [INFO] PR already exists for branch %CURRENT_BRANCH%.
  gh pr view "%CURRENT_BRANCH%" --web
  if errorlevel 1 goto :fail
  goto :success
)

if defined PR_BODY_FILE (
  if not exist "%PR_BODY_FILE%" (
    echo [ERROR] PR body file not found: "%PR_BODY_FILE%"
    goto :fail
  )

  echo [INFO] Creating PR with body from file...
  gh pr create --base "%BASE_BRANCH%" --head "%CURRENT_BRANCH%" --title "%PR_TITLE%" --body-file "%PR_BODY_FILE%"
  if errorlevel 1 goto :fail
) else (
  echo [INFO] Creating PR...
  gh pr create --base "%BASE_BRANCH%" --head "%CURRENT_BRANCH%" --title "%PR_TITLE%"
  if errorlevel 1 goto :fail
)

goto :success

:require_cmd
where %~1 >nul 2>nul
if errorlevel 1 (
  echo [ERROR] %~2
  exit /b 1
)
exit /b 0

:fail
set "EXIT_CODE=%ERRORLEVEL%"
if "%EXIT_CODE%"=="0" set "EXIT_CODE=1"
popd >nul 2>nul
exit /b %EXIT_CODE%

:success
echo [SUCCESS] Pull request flow completed.
popd >nul 2>nul
exit /b 0
