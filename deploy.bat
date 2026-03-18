@echo off
setlocal

echo 📵 SpamNumbers OpenClaw Skill Deployment (Windows)
echo ==================================================
echo.

:: Step 1: Ensure workspace directory exists
echo 📁 Step 1: Creating OpenClaw workspace directory...
set "OPENCLAW_SKILLS_DIR=%USERPROFILE%\.openclaw\workspace\skills"
if not exist "%OPENCLAW_SKILLS_DIR%" (
    mkdir "%OPENCLAW_SKILLS_DIR%"
)
echo    ✅ Workspace directory ready: %OPENCLAW_SKILLS_DIR%
echo.

:: Step 2: Copy project
echo 📦 Step 2: Copying SpamNumbers project...
set "SKILL_DIR=%OPENCLAW_SKILLS_DIR%\spam-numbers"
set "SOURCE_DIR=%~dp0"

:: Remove existing skill directory if it exists
if exist "%SKILL_DIR%" (
    echo    ℹ️  Removing existing installation...
    rmdir /S /Q "%SKILL_DIR%"
)

:: Copy the project
xcopy /E /I /H /Y /Q "%SOURCE_DIR%" "%SKILL_DIR%"

if exist "%SKILL_DIR%" (
    echo    ✅ Project copied to: %SKILL_DIR%
) else (
    echo    ❌ Failed to copy project
    exit /b 1
)
echo.

:: Step 3: Install dependencies
echo 📚 Step 3: Installing npm dependencies...
cd /d "%SKILL_DIR%\scripts"

if not exist "package.json" (
    echo    ❌ package.json not found in scripts directory
    exit /b 1
)

:: Attempt standard install
call npm install --silent
if %ERRORLEVEL% equ 0 (
    echo    ✅ Dependencies installed successfully
) else (
    echo    ⚠️ Standard install failed. Attempting to rebuild native modules...
    call npm run rebuild
    echo    ✅ Native modules rebuilt
)
echo.

:: Step 4: Run initial scan
echo 🌐 Step 4: Running initial spam data scrape...
node index.js scrape

if %ERRORLEVEL% equ 0 (
    echo    ✅ Initial scrape completed
) else (
    echo    ⚠️  Scrape had issues, but installation is complete
)
echo.

echo ==================================================
echo ✅ Deployment Complete!
echo ==================================================
echo.
echo 📍 Skill location: %SKILL_DIR%
echo.
echo Quick start commands:
echo   cd "%SKILL_DIR%\scripts"
echo   node index.js stats
echo.
pause
