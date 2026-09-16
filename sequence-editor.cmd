@echo off
set file=%1
powershell -NoProfile -Command "(Get-Content -Raw -Path '%file%') -replace 'pick 8f2529dc ', 'edit 8f2529dc ' | Set-Content -Encoding utf8 -Path '%file%'"
