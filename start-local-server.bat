@echo off
setlocal

cd /d "%~dp0"
title ChevoInk Local Dev Server

echo [ChevoInk] Preparing local development server...

where npm >nul 2>nul
if errorlevel 1 (
  echo [Error] npm was not found. Please install Node.js and npm first.
  pause
  exit /b 1
)

if not exist ".env" (
  if exist ".env.example" (
    echo [ChevoInk] .env not found. Creating it from .env.example...
    copy /y ".env.example" ".env" >nul
  ) else (
    echo [Error] .env and .env.example are both missing.
    pause
    exit /b 1
  )
)

if not exist "node_modules" (
  echo [ChevoInk] node_modules not found. Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [Error] npm install failed.
    pause
    exit /b 1
  )
)

echo [ChevoInk] Starting local web and api servers...
echo [ChevoInk] Frontend: http://localhost:5173
echo [ChevoInk] Backend:  http://localhost:3001
echo [ChevoInk] Press Ctrl+C to stop.
echo.

call npm run dev

if errorlevel 1 (
  echo.
  echo [Error] Local dev server exited unexpectedly.
  pause
  exit /b 1
)
