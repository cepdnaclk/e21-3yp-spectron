# Spectron Web App

React web application for the Spectron modular monitoring kit.

## Features

- **Authentication**: Sign in and sign up
- **Controller Management**: View and manage controllers
- **Sensor Configuration**: Configure sensors with AI-powered suggestions
- **Monitoring Dashboard**: View real-time data and analytics
- **Alerts**: View and manage alerts
- **Modern UI**: Built with Material-UI (MUI)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set environment variables:
Create a `.env` file:
```
REACT_APP_API_URL=http://spectron-backend-env.eba-3uqs3iea.ap-south-1.elasticbeanstalk.com
REACT_APP_DEMO_MODE=false
```

For local backend development, override `REACT_APP_API_URL` with your local port, for example `http://localhost:8080`.

For the deployed AWS backend, use:

```env
REACT_APP_API_URL=http://spectron-backend-env.eba-3uqs3iea.ap-south-1.elasticbeanstalk.com
```

### Temporary Demo Mode

For full presentation data (controllers, sensors, monitoring trends, alerts), set:

```env
REACT_APP_DEMO_MODE=true
```

This mode is temporary and can be removed later by deleting `src/data/demoData.ts` and demo branches in service files.

3. Run the app:
```bash
npm start
```

## Capacitor Setup (for Mobile)

1. Build the web app:
```bash
npm run build
```

2. Initialize Capacitor:
```bash
npx cap init
```

3. Add platforms:
```bash
npm run cap:add:ios
npm run cap:add:android
```

4. Sync:
```bash
npm run cap:sync
```

5. Open in native IDE:
```bash
npx cap open ios
npx cap open android
```

## Project Structure

```
src/
├── components/     # Reusable components
├── contexts/       # React contexts (Auth)
├── pages/          # Page components
│   ├── auth/      # Authentication pages
│   └── main/      # Main app pages
├── services/       # API services
└── config/         # Configuration
```
