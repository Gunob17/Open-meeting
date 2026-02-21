import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JwtPayload, UserRole } from '../types';
import { UserModel } from '../models/user.model';

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable is required in production');
  }
  console.warn('WARNING: Using default JWT secret. Set JWT_SECRET env var for production.');
  return 'open-meeting-secret-key-change-in-production';
})();

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export function generateToken(payload: JwtPayload, keepLoggedIn?: boolean): string {
  const { twofaPending, ...cleanPayload } = payload;
  return jwt.sign(cleanPayload, JWT_SECRET, { expiresIn: keepLoggedIn ? '30d' : '24h' });
}

export function generatePartialToken(payload: Omit<JwtPayload, 'twofaPending'>): string {
  return jwt.sign({ ...payload, twofaPending: true }, JWT_SECRET, { expiresIn: '5m' });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);

  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  // Block partial (2FA-pending) tokens from accessing regular endpoints
  if (payload.twofaPending) {
    res.status(403).json({ error: '2FA verification required' });
    return;
  }

  // Verify user is still active
  const user = await UserModel.findById(payload.userId);
  if (!user || !user.isActive) {
    res.status(401).json({ error: 'Account is disabled or deleted' });
    return;
  }

  req.user = payload;
  next();
}

// Allows both partial (2FA-pending) and full tokens — used by 2FA verification endpoints
export function authenticatePartial(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);

  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  req.user = payload;
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

export function requireSuperAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== UserRole.SUPER_ADMIN) {
    res.status(403).json({ error: 'Super admin access required' });
    return;
  }
  next();
}

export function requireParkAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user || (req.user.role !== UserRole.SUPER_ADMIN && req.user.role !== UserRole.PARK_ADMIN)) {
    res.status(403).json({ error: 'Park admin access required' });
    return;
  }
  next();
}

// Legacy alias for backward compatibility - now requires park admin or above
export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user || (req.user.role !== UserRole.SUPER_ADMIN && req.user.role !== UserRole.PARK_ADMIN)) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

export function requireCompanyAdminOrAbove(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user || (req.user.role !== UserRole.SUPER_ADMIN && req.user.role !== UserRole.PARK_ADMIN && req.user.role !== UserRole.COMPANY_ADMIN)) {
    res.status(403).json({ error: 'Company admin or admin access required' });
    return;
  }
  next();
}

export function requireAddonRole(role: string) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    UserModel.findById(req.user.userId)
      .then((user) => {
        if (!user || !user.addonRoles.includes(role)) {
          res.status(403).json({ error: `${role} access required` });
          return;
        }
        next();
      })
      .catch(() => {
        res.status(500).json({ error: 'Failed to verify access' });
      });
  };
}

export const requireReceptionist = requireAddonRole('receptionist');
