@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 가 필요합니다. https://nodejs.org 에서 LTS 를 설치한 뒤 다시 실행하세요.
  pause
  exit /b 1
)
if not exist node_modules (
  echo 패키지 설치 중...
  call npm install
)
echo 브라우저에서 http://localhost:3000 을 엽니다. 이 창을 닫지 마세요.
call npm run dev
pause
