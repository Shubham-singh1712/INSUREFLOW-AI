@echo off
set "PATH=C:\Program Files\nodejs;C:\WINDOWS\System32;C:\WINDOWS"
cd /d "%~dp0.."
"C:\Program Files\nodejs\node.exe" "node_modules\next\dist\bin\next" dev -p 4028
