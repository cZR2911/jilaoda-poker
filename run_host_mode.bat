@echo off
echo Starting AI Poker Host Mode...
echo.
echo Please ensure your phone is connected to the SAME Wi-Fi as this computer.
echo.
echo Your Local IP Address is:
ipconfig | findstr /i "IPv4"
echo.
echo On your phone, open the game and click "Server Settings".
echo Enter the IP address shown above followed by :8000
echo Example: http://192.168.1.5:8000
echo.
echo Starting Server...
cd /d "%~dp0"
python -m uvicorn api.index:app --host 0.0.0.0 --port 8000 --reload
pause