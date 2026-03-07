import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { initializeDatabase } from './models/database';

// Import routes
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import companyRoutes from './routes/company.routes';
import roomRoutes from './routes/room.routes';
import bookingRoutes from './routes/booking.routes';
import setupRoutes from './routes/setup.routes';
import settingsRoutes from './routes/settings.routes';
import deviceRoutes from './routes/device.routes';
import deviceApiRoutes from './routes/device-api.routes';
import parkRoutes from './routes/park.routes';
import firmwareRoutes from './routes/firmware.routes';
import statisticsRoutes from './routes/statistics.routes';
import twofaRoutes from './routes/twofa.routes';
import receptionistRoutes from './routes/receptionist.routes';
import ldapRoutes from './routes/ldap.routes';
import ssoRoutes from './routes/sso.routes';
import devRoutes from './routes/dev.routes';
import icalRoutes from './routes/ical.routes';
import calendarTokenRoutes from './routes/calendar-token.routes';
import { ldapScheduler } from './services/ldap-scheduler.service';
import { imapManager } from './services/imap.service';

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy (running behind HAProxy/Nginx)
app.set('trust proxy', 1);

// Security middleware with explicit Content Security Policy
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true },
}));

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost', 'http://localhost:80', 'http://localhost:3000'];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Token'],
}));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' })); // For SAML POST binding

// Global rate limiter — defence against enumeration and DoS
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', globalLimiter);

// Stricter limiter on authentication endpoints to slow brute-force attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later.' },
});
app.use('/api/auth/', authLimiter);

// Routes
app.use('/api/setup', setupRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/auth/2fa', twofaRoutes);
app.use('/api/parks', parkRoutes);
app.use('/api/users', userRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/device', deviceApiRoutes);
app.use('/api/firmware', firmwareRoutes);
app.use('/api/statistics', statisticsRoutes);
app.use('/api/receptionist', receptionistRoutes);
app.use('/api/ldap', ldapRoutes);
app.use('/api/sso', ssoRoutes);
app.use('/api/ical', icalRoutes);
app.use('/api/calendar-tokens', calendarTokenRoutes);

// Dev-only routes — never available in production
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/dev', devRoutes);
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  await initializeDatabase();
  await ldapScheduler.start();
  await imapManager.start();

  app.listen(PORT, () => {
    console.log(`Open Meeting API server running on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export default app;
