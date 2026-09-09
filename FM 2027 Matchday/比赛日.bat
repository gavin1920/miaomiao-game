@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==================================================
echo    FM 2027 Matchday - 比赛日
echo ==================================================
echo    球队用三字代码：ARS LIV MCI CHE TOT NEW MUN EVE
echo                   FUL BHA BOU BRE CRY SUN COV HUL IPS LEE NFO
echo    （全部代码：python scripts\play.py --list）
echo --------------------------------------------------
set /p HOME_T=主队 [回车=ARS]:
set /p AWAY_T=客队 [回车=LIV]:
if "%HOME_T%"=="" set HOME_T=ARS
if "%AWAY_T%"=="" set AWAY_T=LIV
echo.
echo 正在比赛（约 5 秒），完成后自动打开浏览器回放...
python scripts\play.py %HOME_T% %AWAY_T% --seed %RANDOM%
echo.
pause
