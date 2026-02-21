import { Router, Request, Response } from 'express';
import { authenticate, AuthRequest, requireCompanyAdminOrAbove, generateToken, generatePartialToken } from '../middleware/auth.middleware';
import { SsoConfigModel } from '../models/sso-config.model';
import { SsoService } from '../services/sso.service';
import { SettingsModel } from '../models/settings.model';
import { UserRole } from '../types';
import { getEffectiveTwoFaEnforcement } from '../utils/twofa-enforcement';

const router = Router();
const APP_URL = process.env.APP_URL || 'http://localhost';

// Helper: verify the requesting user has access to the company
function canAccessCompany(req: AuthRequest, companyId: string): boolean {
  if (!req.user) return false;
  if (req.user.role === UserRole.SUPER_ADMIN) return true;
  if (req.user.role === UserRole.PARK_ADMIN) return true;
  if (req.user.role === UserRole.COMPANY_ADMIN) return req.user.companyId === companyId;
  return false;
}

// ─── Public endpoints (part of login flow, no auth required) ───

// GET /api/sso/discover?email=user@example.com — Check if email domain has SSO
router.get('/discover', async (req: Request, res: Response) => {
  try {
    const email = req.query.email as string;
    if (!email || !email.includes('@')) {
      res.json({ hasSso: false });
      return;
    }

    const domain = email.split('@')[1].toLowerCase();
    const config = await SsoConfigModel.findByEmailDomain(domain);

    if (!config) {
      res.json({ hasSso: false });
      return;
    }

    res.json({
      hasSso: true,
      configId: config.id,
      protocol: config.protocol,
      displayName: config.displayName,
    });
  } catch (error) {
    console.error('SSO discover error:', error);
    res.json({ hasSso: false });
  }
});

// GET /api/sso/init/:configId — Redirect to IdP
router.get('/init/:configId', async (req: Request, res: Response) => {
  try {
    const { configId } = req.params;
    const config = await SsoConfigModel.findById(configId);

    if (!config || !config.isEnabled) {
      res.status(404).json({ error: 'SSO configuration not found or not enabled' });
      return;
    }

    let authUrl: string;
    if (config.protocol === 'oidc') {
      authUrl = await SsoService.getOidcAuthUrl(configId);
    } else {
      authUrl = await SsoService.getSamlAuthUrl(configId);
    }

    res.redirect(authUrl);
  } catch (error) {
    console.error('SSO init error:', error);
    res.redirect(`${APP_URL}/login?error=${encodeURIComponent('Failed to initiate SSO login')}`);
  }
});

// GET /api/sso/callback/oidc — OIDC callback
router.get('/callback/oidc', async (req: Request, res: Response) => {
  try {
    const { code, state, error: oidcError, error_description } = req.query;

    if (oidcError) {
      res.redirect(`${APP_URL}/login?error=${encodeURIComponent(error_description as string || oidcError as string)}`);
      return;
    }

    if (!code || !state) {
      res.redirect(`${APP_URL}/login?error=${encodeURIComponent('Invalid SSO callback parameters')}`);
      return;
    }

    // Pass all query params so openid-client can validate iss (RFC 9207) if present
    const callbackQuery: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.query)) {
      if (typeof v === 'string') callbackQuery[k] = v;
    }
    const identity = await SsoService.handleOidcCallback(callbackQuery, state as string);
    await handleSsoLogin(identity, res);
  } catch (error: any) {
    console.error('OIDC callback error:', error);
    res.redirect(`${APP_URL}/login?error=${encodeURIComponent(error.message || 'SSO authentication failed')}`);
  }
});

// POST /api/sso/callback/saml — SAML callback (POST binding)
router.post('/callback/saml', async (req: Request, res: Response) => {
  try {
    const { SAMLResponse, RelayState } = req.body;

    if (!SAMLResponse || !RelayState) {
      res.redirect(`${APP_URL}/login?error=${encodeURIComponent('Invalid SAML response')}`);
      return;
    }

    const identity = await SsoService.handleSamlCallback(SAMLResponse, RelayState);
    await handleSsoLogin(identity, res);
  } catch (error: any) {
    console.error('SAML callback error:', error);
    res.redirect(`${APP_URL}/login?error=${encodeURIComponent(error.message || 'SSO authentication failed')}`);
  }
});

// GET /api/sso/saml/metadata/:configId — SP metadata XML
router.get('/saml/metadata/:configId', async (req: Request, res: Response) => {
  try {
    const metadata = await SsoService.generateSamlMetadata(req.params.configId);
    res.type('application/xml').send(metadata);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

/**
 * Common handler after SSO identity is extracted
 */
async function handleSsoLogin(
  identity: { email: string; name: string; subjectId: string; configId: string },
  res: Response
): Promise<void> {
  const config = await SsoConfigModel.findById(identity.configId);
  if (!config) {
    res.redirect(`${APP_URL}/login?error=${encodeURIComponent('SSO configuration not found')}`);
    return;
  }

  // Find or create user (JIT provisioning)
  const user = await SsoService.findOrCreateUser(
    identity.email,
    identity.name,
    identity.subjectId,
    config
  );

  // Check if user is active
  if (!user.isActive) {
    res.redirect(`${APP_URL}/login?error=${encodeURIComponent('Account is disabled')}`);
    return;
  }

  // Check 2FA requirements
  const settings = await SettingsModel.getGlobal();
  const enforcement = await getEffectiveTwoFaEnforcement(user.parkId, user.companyId);

  if (user.twofaEnabled || enforcement === 'required') {
    // Issue partial token for 2FA
    const partialToken = generatePartialToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      parkId: user.parkId,
    });

    const twofaSetupRequired = enforcement === 'required' && !user.twofaEnabled;
    res.redirect(`${APP_URL}/sso/callback?token=${partialToken}&twofaPending=true${twofaSetupRequired ? '&twofaSetupRequired=true' : ''}`);
    return;
  }

  // Issue full token
  const token = generateToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    companyId: user.companyId,
    parkId: user.parkId,
  });

  res.redirect(`${APP_URL}/sso/callback?token=${token}`);
}

// ─── Admin endpoints (authenticated, company admin+) ───

// GET /api/sso/config/:companyId — Get SSO config
router.get('/config/:companyId', authenticate, requireCompanyAdminOrAbove, async (req: AuthRequest, res: Response) => {
  try {
    const { companyId } = req.params;

    if (!canAccessCompany(req, companyId)) {
      res.status(403).json({ error: 'Cannot access SSO config for this company' });
      return;
    }

    const config = await SsoConfigModel.findByCompanyId(companyId);
    if (!config) {
      res.status(404).json({ error: 'No SSO configuration found for this company' });
      return;
    }

    res.json(config);
  } catch (error) {
    console.error('Get SSO config error:', error);
    res.status(500).json({ error: 'Failed to get SSO configuration' });
  }
});

// POST /api/sso/config — Create SSO config
router.post('/config', authenticate, requireCompanyAdminOrAbove, async (req: AuthRequest, res: Response) => {
  try {
    const { companyId, protocol, ...rest } = req.body;

    if (!companyId || !protocol) {
      res.status(400).json({ error: 'companyId and protocol are required' });
      return;
    }

    if (protocol !== 'oidc' && protocol !== 'saml') {
      res.status(400).json({ error: 'protocol must be "oidc" or "saml"' });
      return;
    }

    if (!canAccessCompany(req, companyId)) {
      res.status(403).json({ error: 'Cannot create SSO config for this company' });
      return;
    }

    // Check if config already exists
    const existing = await SsoConfigModel.findByCompanyId(companyId);
    if (existing) {
      res.status(409).json({ error: 'SSO configuration already exists for this company. Update or delete the existing one.' });
      return;
    }

    const config = await SsoConfigModel.create({
      companyId,
      protocol,
      ...rest,
    });

    res.status(201).json(config);
  } catch (error) {
    console.error('Create SSO config error:', error);
    res.status(500).json({ error: 'Failed to create SSO configuration' });
  }
});

// PUT /api/sso/config/:id — Update SSO config
router.put('/config/:id', authenticate, requireCompanyAdminOrAbove, async (req: AuthRequest, res: Response) => {
  try {
    const existing = await SsoConfigModel.findById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'SSO configuration not found' });
      return;
    }

    if (!canAccessCompany(req, existing.companyId)) {
      res.status(403).json({ error: 'Cannot update SSO config for this company' });
      return;
    }

    const config = await SsoConfigModel.update(req.params.id, req.body);
    res.json(config);
  } catch (error) {
    console.error('Update SSO config error:', error);
    res.status(500).json({ error: 'Failed to update SSO configuration' });
  }
});

// DELETE /api/sso/config/:id — Delete SSO config
router.delete('/config/:id', authenticate, requireCompanyAdminOrAbove, async (req: AuthRequest, res: Response) => {
  try {
    const existing = await SsoConfigModel.findById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'SSO configuration not found' });
      return;
    }

    if (!canAccessCompany(req, existing.companyId)) {
      res.status(403).json({ error: 'Cannot delete SSO config for this company' });
      return;
    }

    await SsoConfigModel.delete(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error('Delete SSO config error:', error);
    res.status(500).json({ error: 'Failed to delete SSO configuration' });
  }
});

// POST /api/sso/config/:id/enable — Enable SSO
router.post('/config/:id/enable', authenticate, requireCompanyAdminOrAbove, async (req: AuthRequest, res: Response) => {
  try {
    const existing = await SsoConfigModel.findById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'SSO configuration not found' });
      return;
    }

    if (!canAccessCompany(req, existing.companyId)) {
      res.status(403).json({ error: 'Cannot enable SSO for this company' });
      return;
    }

    const config = await SsoConfigModel.update(req.params.id, { isEnabled: true });
    res.json(config);
  } catch (error) {
    console.error('Enable SSO error:', error);
    res.status(500).json({ error: 'Failed to enable SSO' });
  }
});

// POST /api/sso/config/:id/disable — Disable SSO
router.post('/config/:id/disable', authenticate, requireCompanyAdminOrAbove, async (req: AuthRequest, res: Response) => {
  try {
    const existing = await SsoConfigModel.findById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'SSO configuration not found' });
      return;
    }

    if (!canAccessCompany(req, existing.companyId)) {
      res.status(403).json({ error: 'Cannot disable SSO for this company' });
      return;
    }

    const config = await SsoConfigModel.update(req.params.id, { isEnabled: false });
    res.json(config);
  } catch (error) {
    console.error('Disable SSO error:', error);
    res.status(500).json({ error: 'Failed to disable SSO' });
  }
});

export default router;
