# Production Deployment Guide

This document outlines the production deployment checklist and fixes applied to ensure the application is ready for production deployment.

## ✅ Issues Fixed

### 1. Hardcoded localhost URLs
**Status:** ✅ Fixed

**Changes:**
- **Backend (`src/app.ts`)**: CORS now uses `FRONTEND_URL` environment variable
- **Backend (`src/server.ts`)**: Server URLs now use environment variables (`BASE_URL`, `HOST`, `PROTOCOL`)
- **Frontend (`app/services/api.ts`)**: Uses `NEXT_PUBLIC_API_URL` environment variable
- **Frontend (`app/search/page.tsx`)**: Uses `NEXT_PUBLIC_API_URL` environment variable
- **Frontend (`app/profile/page.tsx`)**: Uses `NEXT_PUBLIC_API_URL` environment variable
- **Frontend (`next.config.ts`)**: Image remote patterns now support production URLs

### 2. Missing Environment Variables
**Status:** ✅ Fixed

**Required Environment Variables:**

#### Backend (`.env`):
```bash
# Server Configuration
PORT=3001
HOST=0.0.0.0  # Use 0.0.0.0 for production to accept external connections
NODE_ENV=production
PROTOCOL=https  # Use https in production
BASE_URL=https://api.yourdomain.com

# Frontend URL (for CORS)
FRONTEND_URL=https://yourdomain.com

# Database Configuration
# Option 1: Use DATABASE_URL (recommended)
DATABASE_URL=postgresql://user:password@host:5432/database

# Option 2: Use individual PostgreSQL variables
# PGHOST=your-db-host
# PGPORT=5432
# PGUSER=your-db-user
# PGPASSWORD=your-db-password
# PGDATABASE=your-db-name

# JWT Secret (REQUIRED - use a strong random string)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
```

#### Frontend (`.env.local` or `.env.production`):
```bash
# API Backend URL
NEXT_PUBLIC_API_URL=https://api.yourdomain.com

# Debug flags (optional, set to 0 in production)
NEXT_PUBLIC_DEBUG=0
NEXT_PUBLIC_DEBUG_SEARCH=0
```

### 3. Production Build Issues
**Status:** ✅ Fixed

**Changes:**
- Added `build` script to compile TypeScript: `npm run build`
- Added `start` script for production: `npm run start`
- Added `start:prod` script with NODE_ENV set: `npm run start:prod`

**Build Process:**
```bash
# Backend
cd backend
npm install
npm run build  # Compiles TypeScript to dist/
npm run start  # Runs compiled JavaScript

# Frontend
cd frontend
npm install
npm run build  # Next.js production build
npm run start  # Start production server
```

### 4. CORS Configuration
**Status:** ✅ Fixed

**Changes:**
- CORS now dynamically configures allowed origins based on `FRONTEND_URL` environment variable
- Development mode still allows `http://localhost:3000`
- Production mode only allows the configured `FRONTEND_URL`

### 5. Database Connection Handling
**Status:** ✅ Fixed

**Changes:**
- Added error handlers for database pool (`pool.on("error")`)
- Added connection event handlers for monitoring
- Database pool is properly closed during graceful shutdown

### 6. Security Risks
**Status:** ✅ Partially Addressed

**Fixed:**
- JWT_SECRET validation exists and is checked before use
- Environment variables are properly loaded before use

**Recommendations:**
- Consider adding rate limiting (e.g., `express-rate-limit`)
- Consider adding security headers (e.g., `helmet`)
- Ensure HTTPS is used in production
- Use strong, randomly generated JWT_SECRET
- Regularly rotate secrets

### 7. Linux Server Environment Compatibility
**Status:** ✅ Fixed

**Changes:**
- Replaced `__dirname` with `process.cwd()` in scripts for better cross-platform compatibility
- Path handling now works correctly in compiled JavaScript on Linux
- Server binds to `0.0.0.0` by default in production (allows external connections)

**Files Updated:**
- `backend/src/scripts/importBooksFromCsv.ts`
- `backend/src/scripts/csvToJson.ts`
- `backend/src/scripts/importBooksFromJson.ts`

### 8. Memory Leaks and Unhandled Promise Errors
**Status:** ✅ Fixed

**Changes:**
- Added `unhandledRejection` handler in `server.ts`
- Added `uncaughtException` handler with graceful shutdown
- Added `SIGTERM` and `SIGINT` handlers for graceful shutdown
- Database pool is properly closed on shutdown
- Scripts now have proper error handling with `.catch()`

## 📋 Pre-Deployment Checklist

### Backend
- [ ] Set all required environment variables in `.env`
- [ ] Generate a strong `JWT_SECRET` (use `openssl rand -base64 32`)
- [ ] Configure database connection (`DATABASE_URL` or individual PG vars)
- [ ] Set `FRONTEND_URL` to your production frontend domain
- [ ] Set `BASE_URL` to your production backend domain
- [ ] Set `NODE_ENV=production`
- [ ] Run `npm run build` to compile TypeScript
- [ ] Test database connection
- [ ] Configure process manager (PM2, systemd, etc.)

### Frontend
- [ ] Set `NEXT_PUBLIC_API_URL` to your production backend URL
- [ ] Set `NEXT_PUBLIC_DEBUG=0` and `NEXT_PUBLIC_DEBUG_SEARCH=0`
- [ ] Run `npm run build` to create production build
- [ ] Test production build locally with `npm run start`
- [ ] Configure reverse proxy (nginx, etc.) if needed

### Infrastructure
- [ ] Set up PostgreSQL database
- [ ] Run database migrations (`scripts/apply_schema_updates.sql`)
- [ ] Configure SSL/TLS certificates (Let's Encrypt, etc.)
- [ ] Set up reverse proxy (nginx) for HTTPS
- [ ] Configure firewall rules
- [ ] Set up monitoring and logging
- [ ] Configure backup strategy for database

## 🚀 Deployment Steps

### 1. Backend Deployment

```bash
# On your server
cd /path/to/backend
git pull origin main  # or your production branch

# Install dependencies
npm install --production

# Build TypeScript
npm run build

# Set environment variables (use your preferred method)
# Option 1: .env file
cp .env.example .env
# Edit .env with production values

# Option 2: System environment variables
export NODE_ENV=production
export DATABASE_URL=...
export JWT_SECRET=...
# etc.

# Start with PM2 (recommended)
pm2 start dist/server.js --name novel-backend
pm2 save
pm2 startup  # Follow instructions to enable on boot

# Or use systemd (create service file)
# See systemd example below
```

### 2. Frontend Deployment

```bash
# On your server or build server
cd /path/to/frontend
git pull origin main

# Install dependencies
npm install

# Set environment variables
export NEXT_PUBLIC_API_URL=https://api.yourdomain.com

# Build for production
npm run build

# Start production server
npm run start

# Or use PM2
pm2 start npm --name novel-frontend -- start
```

### 3. Nginx Configuration Example

```nginx
# Backend API
server {
    listen 80;
    server_name api.yourdomain.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Frontend
server {
    listen 80;
    server_name yourdomain.com;
    
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    root /path/to/frontend/.next;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    location /_next/static {
        alias /path/to/frontend/.next/static;
        expires 365d;
        add_header Cache-Control "public, immutable";
    }
}
```

### 4. Systemd Service Example (Backend)

Create `/etc/systemd/system/novel-backend.service`:

```ini
[Unit]
Description=Novel Backend API
After=network.target postgresql.service

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/backend
Environment="NODE_ENV=production"
EnvironmentFile=/path/to/backend/.env
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable novel-backend
sudo systemctl start novel-backend
sudo systemctl status novel-backend
```

## 🔍 Monitoring and Maintenance

### Health Checks
- Backend health endpoint: `GET /api/health`
- Monitor database connection pool
- Monitor server logs for errors

### Logs
- Backend logs: Check PM2 logs or systemd journal
- Frontend logs: Check Next.js logs
- Database logs: Check PostgreSQL logs

### Common Issues

1. **CORS Errors**: Ensure `FRONTEND_URL` matches your frontend domain exactly
2. **Database Connection**: Verify `DATABASE_URL` or PG environment variables
3. **JWT Errors**: Ensure `JWT_SECRET` is set and consistent
4. **Port Already in Use**: Check if another process is using the port
5. **File Upload Issues**: Ensure `uploads/` directory exists and has write permissions

## 📝 Notes

- Always test in a staging environment before production
- Keep environment variables secure (never commit `.env` files)
- Use strong passwords and secrets
- Regularly update dependencies
- Monitor server resources (CPU, memory, disk)
- Set up automated backups for the database
