# Chakri Sheba Server (Backend Engine)
**API Server, Spider Crawler & Autonomous Background Worker for Chakri Sheba**

## Tech Stack
* **Runtime:** Node.js (v20+)
* **Framework:** Express.js + TypeScript
* **Database Engine:** `src/lib/db.ts` (`src/db/local_store.json` / `schema.sql`)
* **Spiders & Automation:** Playwright Chromium Headless

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Variables
Check `.env` file:
```env
PORT=6969
NODE_ENV=development
FRONTEND_URL=http://localhost:3050
SESSION_SECRET=super_secret_cryptographic_key_at_least_32_characters_long
SESSION_EXPIRY_DAYS=7
CHAKRI_DB_FILE=./src/db/local_store.json
CHAKRI_UPLOAD_DIR=./uploads
```

### 3. Run Development Server
```bash
npm run dev
```
* **Base URL:** `http://localhost:6969`
* **API Endpoints:** `http://localhost:6969/api/*`
* **Health Check:** `http://localhost:6969/health`
* **Uploads Directory:** `http://localhost:6969/uploads`

## Build for Production
```bash
npm run build
npm start
```
