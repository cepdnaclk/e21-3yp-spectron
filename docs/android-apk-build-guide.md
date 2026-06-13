# Spectron Android APK Build Guide

## 1. Architecture

The mobile application uses:

- **Frontend:** React and TypeScript
- **Mobile wrapper:** Capacitor
- **Android build system:** Gradle
- **Cloud backend:** `https://spectroniot.xyz`
- **Java:** JDK 17

The React application is compiled into static HTML, CSS, and JavaScript. Capacitor embeds these files inside an Android WebView and exposes native Android features.

## 2. Prerequisites

Install:

- Node.js
- npm
- JDK 17
- Android SDK
- Android SDK Platform 33
- Android Build Tools
- Capacitor CLI

Verify Java:

```powershell
java -version
```

The current development machine uses:

```text
C:\Users\pkjar\.jdk\jdk-17.0.16
```

For portability, other developers can use any compatible JDK 17 installation and update `JAVA_HOME` accordingly.

## 3. Backend Configuration

The frontend API address is configured in:

```text
software/frontend/web/.env
```

Use:

```env
REACT_APP_API_URL=https://spectroniot.xyz
```

HTTPS encrypts login credentials, authentication tokens, sensor readings, and account data.

Do not use the Elastic Beanstalk hostname directly. Its TLS certificate is issued for `spectroniot.xyz`, so connecting through a different hostname causes Android certificate verification errors.

## 4. Install Frontend Dependencies

Open PowerShell in:

```text
software/frontend/web
```

Install dependencies:

```powershell
npm install
```

This is normally required after cloning the repository or changing dependencies.

## 5. Build the React Frontend

Create the production frontend:

```powershell
npm run build
```

This generates:

```text
software/frontend/web/build
```

The directory contains the compiled frontend assets that will be packaged into the Android application.

## 6. Capacitor Configuration

The Capacitor configuration is located at:

```text
software/frontend/web/capacitor.config.ts
```

Example:

```typescript
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.spectron.app',
  appName: 'Spectron',
  webDir: 'build',
  server: {
    androidScheme: 'https',
  },
};

export default config;
```

Important properties:

- `appId`: Android application identifier
- `appName`: Application name displayed by Android
- `webDir`: Directory containing the React production build
- `androidScheme`: Secure internal scheme used by the Capacitor WebView

## 7. Synchronize Capacitor

After building the frontend, synchronize it with Android:

```powershell
npx cap sync android
```

This command:

1. Copies the React production assets into:

   ```text
   android/app/src/main/assets/public
   ```

2. Updates Capacitor plugins and generated Android configuration.

Run this command whenever frontend code, assets, icons, dependencies, or Capacitor configuration changes.

## 8. Configure Java

Set JDK 17 for the current PowerShell session:

```powershell
$env:JAVA_HOME='C:\Users\pkjar\.jdk\jdk-17.0.16'
$env:Path="$env:JAVA_HOME\bin;" + $env:Path
```

Verify that Gradle uses the correct Java installation:

```powershell
cd android
.\gradlew -version
```

The output should report Java 17.

## 9. Build the Debug APK

From the Android directory:

```powershell
.\gradlew clean assembleDebug
```

The generated APK is:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

The debug APK is automatically signed with Android's debug certificate. It can be installed directly on development and testing devices.

## 10. Complete Debug Build Sequence

Run the following commands from `software/frontend/web`:

```powershell
npm install
npm run build
npx cap sync android

$env:JAVA_HOME='C:\Users\pkjar\.jdk\jdk-17.0.16'
$env:Path="$env:JAVA_HOME\bin;" + $env:Path

cd android
.\gradlew clean assembleDebug
```

For subsequent builds, `npm install` can usually be skipped when dependencies have not changed.

## 11. Install the APK

Install through Android Debug Bridge:

```powershell
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

The `-r` option replaces the existing application while preserving its application data.

Alternatively, transfer the APK to the Android device and install it manually.

Android may require permission to install applications from unknown sources.

## 12. Build a Release APK

A production release requires a private signing key.

Create a keystore:

```powershell
keytool -genkeypair `
  -v `
  -keystore spectron-release.keystore `
  -alias spectron `
  -keyalg RSA `
  -keysize 2048 `
  -validity 10000
```

The keystore and its passwords must not be committed to Git.

Configure the release signing details in the Android Gradle configuration, then run:

```powershell
.\gradlew clean assembleRelease
```

The output is:

```text
android/app/build/outputs/apk/release/app-release.apk
```

For Google Play distribution, build an Android App Bundle:

```powershell
.\gradlew clean bundleRelease
```

The output is:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

## 13. App Icon Process

The source logo is:

```text
software/frontend/web/public/assets/spectron-logo.svg
```

Android requires raster icons at several resolutions. Generated launcher icons are stored under:

```text
android/app/src/main/res/mipmap-mdpi
android/app/src/main/res/mipmap-hdpi
android/app/src/main/res/mipmap-xhdpi
android/app/src/main/res/mipmap-xxhdpi
android/app/src/main/res/mipmap-xxxhdpi
```

After changing icons, synchronize Capacitor if necessary and rebuild the APK.

## 14. Troubleshooting

### Old frontend appears in the APK

Run:

```powershell
npm run build
npx cap sync android
cd android
.\gradlew clean assembleDebug
```

Skipping `npx cap sync android` leaves old frontend assets inside the Android project.

### Java or Gradle error

Ensure JDK 17 is active:

```powershell
$env:JAVA_HOME='C:\Users\pkjar\.jdk\jdk-17.0.16'
$env:Path="$env:JAVA_HOME\bin;" + $env:Path
```

Java 24 or 25 may not be compatible with the current Android Gradle toolchain.

### Certificate hostname error

The backend URL must be:

```text
https://spectroniot.xyz
```

The TLS certificate does not cover the Elastic Beanstalk hostname.

### Backend cannot be reached

Verify the health endpoint:

```powershell
curl.exe https://spectroniot.xyz/healthz
```

Expected response:

```json
{"status":"ok"}
```

### Android cannot access an HTTP backend

Android blocks cleartext HTTP traffic by default. Use HTTPS in production.

Local HTTP testing requires an Android network security configuration. Cleartext traffic should not be enabled in production builds.

### Page does not scroll in the Android app

Ensure the application has a defined scroll container and that touch scrolling is enabled. The Spectron frontend uses `#root` as its mobile scroll container.

After changing global layout or scrolling styles, rebuild and synchronize the frontend:

```powershell
npm run build
npx cap sync android
```

## 15. Build Pipeline Summary

```text
React and TypeScript source
          |
          | npm run build
          v
Production HTML, CSS, and JavaScript
          |
          | npx cap sync android
          v
Capacitor Android project
          |
          | Gradle assembleDebug or assembleRelease
          v
APK file
          |
          v
Android device
```

## 16. Recommended Development Workflow

For each frontend change:

1. Update the React source.
2. Run relevant tests.
3. Run `npm run build`.
4. Run `npx cap sync android`.
5. Run `.\gradlew clean assembleDebug`.
6. Install the new APK.
7. Test login, navigation, scrolling, responsive layouts, API connectivity, and native permissions on a physical Android device.

