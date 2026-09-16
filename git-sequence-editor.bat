@echo off
set file=%1
powershell -NoProfile -Command "(Get-Content -Raw -Path '%file%') -replace 'pick 23797909 ', 'edit 23797909 ' -replace 'pick 7e89c992 ', 'edit 7e89c992 ' | Set-Content -Encoding utf8 -Path '%file%'"
