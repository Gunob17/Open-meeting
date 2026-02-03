import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JwtPayload, UserRole } from '../types';

const JWT_SECRET = process.env.JWT_SECRET || 'open-meeting-secret-key-change-in-production';

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
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
