@echo off
echo ==========================================
echo Google Antigravity IDE 更新程式
echo ==========================================
echo.
echo 注意：請確保您已經完全關閉 Antigravity IDE。
echo.
pause
echo 正在執行更新指令...
winget upgrade --id Google.Antigravity --force --accept-package-agreements --accept-source-agreements
echo.
echo 更新程序已結束。請檢查上方是否有錯誤訊息。
echo 如果顯示成功，您可以重新啟動 Antigravity 了。
echo.
pause
