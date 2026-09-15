@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
if not exist "%PY%" set "PY=python"
echo 일일 생산 집계 웹앱을 시작합니다...
echo 브라우저가 열리면 엑셀을 업로드하세요.
echo 주소: http://localhost:8501
"%PY%" -m streamlit run app.py
if errorlevel 1 pause
