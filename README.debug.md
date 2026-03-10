# Development & Debugging Guide

## Quick Start - Local Development (No Docker!)

### 1. Install Dependencies
```bash
# Backend
cd backend
npm install

# Frontend (in a new terminal)
cd frontend
npm install
```

### 2. Start Development

**Option A: Using VSCode Debugger (Recommended)**
1. Press `F5` or go to Run & Debug (Ctrl+Shift+D)
2. Select "Debug Backend" from the dropdown
3. Click the green play button or press F5
4. Set breakpoints by clicking next to line numbers
5. The backend will auto-restart when you save files

**Option B: Using Terminal**
```bash
# Backend (auto-restarts on changes)
cd backend
npm run dev

# Frontend (in a new terminal)
cd frontend
npm start
```

### 3. Access the Application
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001/api
- Health Check: http://localhost:3001/api/health

## Debugging Features

### Backend Debugging
- **Breakpoints**: Click next to any line number in VSCode
- **Variable Inspection**: Hover over variables when paused
- **Call Stack**: See the execution path in the Debug sidebar
- **Console**: View logs in the integrated terminal
- **Auto-Restart**: Code changes automatically restart the server

### Debug Configurations Available

1. **Debug Backend** - Main debug config with auto-restart
2. **Debug Backend (attach)** - Attach to already running process
3. **Full Stack** - Compound configuration (backend only for now)

### Useful VSCode Shortcuts
- `F5` - Start/Continue debugging
- `F9` - Toggle breakpoint
- `F10` - Step over
- `F11` - Step into
- `Shift+F11` - Step out
- `Ctrl+Shift+F5` - Restart debugger
- `Shift+F5` - Stop debugger

## Database Location

The SQLite database is stored at:
```
backend/data/database.sqlite
```

You can use SQLite browser extensions or tools like DB Browser for SQLite to inspect it.

## Environment Variables

For local development, create a `.env` file in the backend folder:
```bash
cp ../.env.local backend/.env
```

Or manually create `backend/.env` with:
```
NODE_ENV=development
PORT=3001
JWT_SECRET=open-meeting-secret-key-change-in-production
```

## Common Issues

### Port Already in Use
If port 3001 is already in use:
```bash
# Windows
netstat -ano | findstr :3001
taskkill /PID <PID> /F

# Linux/Mac
lsof -i :3001
kill -9 <PID>
```

### Database Locked
If you get "database is locked" errors:
1. Stop all running instances
2. Close any SQLite browser tools
3. Restart the debug session

### TypeScript Errors
```bash
cd backend
npm run build
```

## Docker vs Local Development

### Use Local Development When:
- ✅ Debugging with breakpoints
- ✅ Quick iteration and testing
- ✅ Developing new features
- ✅ Testing changes rapidly

### Use Docker When:
- ✅ Testing production builds
- ✅ Deploying to production
- ✅ Sharing with others
- ✅ Ensuring consistency across environments

## Tips

1. **Keep Docker Stopped**: When debugging locally, stop Docker to avoid port conflicts:
   ```bash
   docker-compose -f docker-compose.dev.yml down
   ```

2. **Use Nodemon Alternative**: The `ts-node-dev` is already set up for hot-reload

3. **Check Logs**: All console.log() statements appear in the VSCode Debug Console

4. **Inspect Database**: The database persists between runs in `backend/data/`

5. **Frontend Proxy**: If frontend can't reach backend, check `frontend/package.json` for proxy settings

## Need Help?

- Check the VSCode Debug Console for errors
- Review the terminal output for startup issues
- Ensure all dependencies are installed
- Verify the database file isn't locked by another process
