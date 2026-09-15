# SPECTRON Market Website

SPECTRON is a market-style business website for selling a modular IoT monitoring kit for Sri Lankan agriculture and other field-based industries.

This project is designed to:
- promote the product
- explain the benefits and solutions
- show product modules and pricing
- collect customer inquiries
- handle demo requests and contact messages

It is not just a technical demo. It is a sales and marketing website for a product business.

## What the website does

The website includes sections such as:
- hero banner and product promotion
- product features and benefits
- sensor modules and use cases
- pricing and custom package builder
- testimonials and FAQs
- contact form and demo request flow
- backend storage for customer submissions
- email notifications for admin follow-up

## Tech stack

- Frontend: React + Vite
- Backend: Express.js
- Database: PostgreSQL
- Email: SMTP via Nodemailer
- AI support: Gemini API integration for recommendation logic

## Project structure

- frontend/ - storefront and landing page UI
- backend/ - API, database logic, validation, email sending
- backend/db/schema.sql - database schema
- start-spectron.ps1 - starts PostgreSQL, applies schema, and launches the app
- README.md - setup and usage guide

## Requirements

Before running the project, install:
- Node.js
- PostgreSQL
- Git
- A local PostgreSQL instance running on localhost:5432

## 1. Install dependencies

From the project root:

```powershell
cd frontend
npm install

cd ..\backend
npm install
```

## 2. Create the environment file

Copy the example environment file:

```powershell
copy backend\.env.example backend\.env
```

Then update `backend/.env` with your own real values:

- DATABASE_URL
- CORS_ORIGIN
- SMTP settings
- MAIL_FROM
- ADMIN_EMAIL
- GEMINI_API_KEY

Example:

```env
NODE_ENV=development
PORT=5000
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/spectron
CORS_ORIGIN=http://localhost:5173
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_smtp_username
SMTP_PASS=your_smtp_password
MAIL_FROM="SPECTRON <no-reply@spectron.example>"
ADMIN_EMAIL=admin@spectron.example
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
```

## 3. Start the project

From the project root, run:

```powershell
./start-spectron.ps1
```

This script will:
- check for PostgreSQL tools
- create the local database if needed
- run the schema setup
- start the backend API
- start the frontend website

## Open the website

After the script runs, open:

- Frontend: http://127.0.0.1:5173
- Backend API: http://localhost:5000

## Main functions of the site

### Customer-facing pages
- product overview
- product benefits
- modular sensor information
- pricing and custom package options
- testimonials and FAQs

### Sales/contact flow
- customer fills contact form
- request is saved to database
- admin email is sent
- automated response can be sent if enabled

## Useful commands

### Start frontend manually

```powershell
cd frontend
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

### Start backend manually

```powershell
cd backend
npm run dev
```

### Apply database schema manually

```powershell
cd backend
npm run db:schema
```

## Troubleshooting

### Website does not load
- check if the frontend is running on port 5173
- check if there is any port conflict
- restart the app using the launcher script

### Backend is not working
- check the PostgreSQL database is running
- verify the connection string in `backend/.env`
- check whether the database schema was created successfully

### Email or form submissions are failing
- confirm SMTP settings are correct
- check the environment variables in `backend/.env`
- look at the backend logs in `backend/dev-logs`

## Logs

The project stores logs in:

- backend/dev-logs/backend.log
- backend/dev-logs/frontend.log
- backend/dev-logs/postgres.log

## What this project is for

This website is built to help the business sell SPECTRON products online and collect customer interest. It is essentially a market and sales website for a technology product, with a backend to manage inquiries and demo requests.

## License

This project is intended for academic and development use within the current workspace.
