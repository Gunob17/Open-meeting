import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
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
import { ldapScheduler } from './services/ldap-scheduler.service';

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());

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

  app.listen(PORT, () => {
    console.log(`Open Meeting API server running on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export default app;
