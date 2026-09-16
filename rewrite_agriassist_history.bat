@echo off
cd /d C:\Users\dell\OneDrive\Documents\spectron-agriassist\e21-3yp-spectron

git checkout -B clean/agriassist-new-version origin/agriassist-new-version

git cherry-pick -n 237979090ec0199f78282c955df69b4523309e0c
powershell -NoProfile -Command "(Get-Content -Raw software/backend/.env.example) -replace 'GROQ_API_KEY=.*', 'GROQ_API_KEY=your_groq_api_key_here' | Set-Content -Encoding utf8 software/backend/.env.example"
git add software/backend/.env.example
git commit -m "recommendation layer initiation"

git cherry-pick 7e89c9928050cdf710d8e233d84ef011b6d13a3f || goto conflict

goto continue

:conflict
powershell -NoProfile -Command "(Get-Content -Raw software/backend/.env.example) -replace 'GROQ_API_KEY=.*', 'GROQ_API_KEY=your_groq_api_key_here' | Set-Content -Encoding utf8 software/backend/.env.example"
git add software/backend/.env.example
git cherry-pick --continue

goto continue

:continue
git cherry-pick ab7215f7f750f59b692165d47e14db6c9ec08a46
if errorlevel 1 goto error

git cherry-pick 977e7b7c1e84a8195904d6a7235b4d3f30f01d1e
if errorlevel 1 goto error

git cherry-pick d96eb28b2d8d52db529615cf9b6a3f9dd6cc20a8
if errorlevel 1 goto error

echo Rewritten clean branch commits:
git log --oneline --reverse origin/agriassist-new-version..HEAD
echo ---

git log -S "gsk_" --oneline HEAD
echo ---

git show HEAD:software/backend/.env.example

echo done
exit /b 0

:error
echo ERROR during cherry-pick
exit /b 1
