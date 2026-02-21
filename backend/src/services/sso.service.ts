import crypto from 'crypto';
import { SsoConfigModel } from '../models/sso-config.model';
import { UserModel } from '../models/user.model';
import { CompanyModel } from '../models/company.model';
import { SsoConfig, User, AuthSource } from '../types';

const APP_URL = process.env.APP_URL || 'http://localhost';
const API_URL = process.env.API_URL || APP_URL;

// In-memory state store for OIDC/SAML (short-lived, auto-cleanup)
const stateStore = new Map<string, { configId: string; createdAt: number }>();

// Clean up expired states every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of stateStore.entries()) {
    if (now - value.createdAt > 10 * 60 * 1000) { // 10 min expiry
      stateStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

export class SsoService {
  /**
   * Generate a random state parameter and store it
   */
  static generateState(configId: string): string {
    const state = crypto.randomBytes(32).toString('hex');
    stateStore.set(state, { configId, createdAt: Date.now() });
    return state;
  }

  /**
   * Validate and consume a state parameter
   */
  static validateState(state: string): string | null {
    const entry = stateStore.get(state);
    if (!entry) return null;
    if (Date.now() - entry.createdAt > 10 * 60 * 1000) {
      stateStore.delete(state);
      return null;
    }
    stateStore.delete(state);
    return entry.configId;
  }

  /**
   * Get OIDC authorization URL
   */
  static async getOidcAuthUrl(configId: string): Promise<string> {
    const config = await SsoConfigModel.findById(configId);
    if (!config || !config.isEnabled || config.protocol !== 'oidc') {
      throw new Error('SSO configuration not found or not enabled');
    }
    if (!config.oidcIssuerUrl || !config.oidcClientId) {
      throw new Error('OIDC configuration incomplete');
    }

    const state = this.generateState(configId);
    const callbackUrl = `${API_URL}/api/sso/callback/oidc`;

    // Dynamic import for openid-client (CommonJS compatible v5)
    const { Issuer } = await import('openid-client');
    const issuer = await Issuer.discover(config.oidcIssuerUrl);
    const clientSecret = await SsoConfigModel.getDecryptedClientSecret(configId);

    const client = new issuer.Client({
      client_id: config.oidcClientId,
      client_secret: clientSecret || undefined,
      redirect_uris: [callbackUrl],
      response_types: ['code'],
    });

    const scopes = config.oidcScopes || 'openid email profile';

    const url = client.authorizationUrl({
      scope: scopes,
      state,
      redirect_uri: callbackUrl,
    });

    return url;
  }

  /**
   * Handle OIDC callback — exchange code for tokens and extract user identity
   */
  static async handleOidcCallback(callbackQuery: Record<string, string>, state: string): Promise<{ email: string; name: string; subjectId: string; configId: string }> {
    const configId = this.validateState(state);
    if (!configId) {
      throw new Error('Invalid or expired SSO state');
    }

    const config = await SsoConfigModel.findById(configId);
    if (!config || !config.isEnabled || config.protocol !== 'oidc') {
      throw new Error('SSO configuration not found or not enabled');
    }

    const callbackUrl = `${API_URL}/api/sso/callback/oidc`;

    const { Issuer } = await import('openid-client');
    const issuer = await Issuer.discover(config.oidcIssuerUrl!);
    const clientSecret = await SsoConfigModel.getDecryptedClientSecret(configId);

    const client = new issuer.Client({
      client_id: config.oidcClientId!,
      client_secret: clientSecret || undefined,
      redirect_uris: [callbackUrl],
      response_types: ['code'],
    });

    // Build query string from all callback parameters (preserves iss if IdP sends it per RFC 9207)
    const qs = Object.entries(callbackQuery).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    const params = client.callbackParams({ method: 'GET', url: `?${qs}` } as any);
    const tokenSet = await client.callback(callbackUrl, params, { state });

    const claims = tokenSet.claims();
    const email = claims.email as string;
    const name = (claims.name || claims.preferred_username || email) as string;
    const subjectId = claims.sub;

    if (!email) {
      throw new Error('Email not provided by identity provider. Ensure the "email" scope is requested.');
    }

    return { email, name, subjectId, configId };
  }

  /**
   * Get SAML authorization URL
   */
  static async getSamlAuthUrl(configId: string): Promise<string> {
    const config = await SsoConfigModel.findById(configId);
    if (!config || !config.isEnabled || config.protocol !== 'saml') {
      throw new Error('SSO configuration not found or not enabled');
    }
    if (!config.samlEntryPoint) {
      throw new Error('SAML configuration incomplete');
    }

    const state = this.generateState(configId);
    const callbackUrl = config.samlCallbackUrl || `${API_URL}/api/sso/callback/saml`;

    const { SAML } = await import('@node-saml/node-saml');
    const saml = new SAML({
      entryPoint: config.samlEntryPoint,
      issuer: config.samlIssuer || `${API_URL}/api/sso/saml/metadata/${configId}`,
      callbackUrl,
      idpCert: config.samlCert || '',
      wantAssertionsSigned: false,
      wantAuthnResponseSigned: false,
    });

    const url = await saml.getAuthorizeUrlAsync(state, undefined, {});
    return url;
  }

  /**
   * Handle SAML callback — validate assertion and extract user identity
   */
  static async handleSamlCallback(samlResponse: string, relayState: string): Promise<{ email: string; name: string; subjectId: string; configId: string }> {
    const configId = this.validateState(relayState);
    if (!configId) {
      throw new Error('Invalid or expired SSO state');
    }

    const config = await SsoConfigModel.findById(configId);
    if (!config || !config.isEnabled || config.protocol !== 'saml') {
      throw new Error('SSO configuration not found or not enabled');
    }

    const callbackUrl = config.samlCallbackUrl || `${API_URL}/api/sso/callback/saml`;

    const { SAML } = await import('@node-saml/node-saml');
    const saml = new SAML({
      entryPoint: config.samlEntryPoint || '',
      issuer: config.samlIssuer || `${API_URL}/api/sso/saml/metadata/${configId}`,
      callbackUrl,
      idpCert: config.samlCert || '',
      wantAssertionsSigned: false,
      wantAuthnResponseSigned: false,
    });

    const { profile } = await saml.validatePostResponseAsync({ SAMLResponse: samlResponse });

    if (!profile) {
      throw new Error('SAML assertion validation failed');
    }

    const email = (profile as any).email || (profile as any).nameID;
    const name = (profile as any).displayName || (profile as any).firstName || email;
    const subjectId = (profile as any).nameID || email;

    if (!email || !email.includes('@')) {
      throw new Error('Email not provided by identity provider');
    }

    return { email, name, subjectId, configId };
  }

  /**
   * Find or create user after SSO authentication (JIT provisioning)
   */
  static async findOrCreateUser(
    email: string,
    name: string,
    subjectId: string,
    ssoConfig: SsoConfig
  ): Promise<User> {
    // 1. Find by SSO subject + provider
    const existingBySubject = await UserModel.findBySsoSubject(subjectId, ssoConfig.id);
    if (existingBySubject) {
      return existingBySubject;
    }

    // 2. Find by email — link SSO identity
    const existingByEmail = await UserModel.findByEmail(email);
    if (existingByEmail) {
      // Only link if user belongs to the same company
      if (existingByEmail.companyId === ssoConfig.companyId) {
        await UserModel.linkSsoIdentity(
          existingByEmail.id,
          subjectId,
          ssoConfig.id,
          ssoConfig.protocol as 'oidc' | 'saml'
        );
        return (await UserModel.findById(existingByEmail.id))!;
      }
      throw new Error('Email is already associated with a different company');
    }

    // 3. Auto-create if allowed
    if (!ssoConfig.autoCreateUsers) {
      throw new Error('User not found. Auto-creation is disabled for this SSO configuration.');
    }

    // Validate email domain if domains are configured
    this.validateEmailDomain(email, ssoConfig);

    // Get company to find parkId
    const company = await CompanyModel.findById(ssoConfig.companyId);
    if (!company) {
      throw new Error('Company not found for SSO configuration');
    }

    const user = await UserModel.createFromSso({
      email,
      name,
      role: ssoConfig.defaultRole || 'user',
      companyId: ssoConfig.companyId,
      parkId: company.parkId,
      authSource: ssoConfig.protocol as 'oidc' | 'saml',
      ssoSubjectId: subjectId,
      ssoProviderId: ssoConfig.id,
    });

    return user;
  }

  /**
   * Validate email domain against SSO config
   */
  static validateEmailDomain(email: string, ssoConfig: SsoConfig): void {
    if (ssoConfig.emailDomains.length === 0) return; // No restriction

    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain || !ssoConfig.emailDomains.map(d => d.toLowerCase()).includes(domain)) {
      throw new Error(`Email domain "${domain}" is not allowed for this SSO configuration`);
    }
  }

  /**
   * Generate SAML SP metadata XML
   */
  static async generateSamlMetadata(configId: string): Promise<string> {
    const config = await SsoConfigModel.findById(configId);
    if (!config || config.protocol !== 'saml') {
      throw new Error('SAML configuration not found');
    }

    const callbackUrl = config.samlCallbackUrl || `${API_URL}/api/sso/callback/saml`;
    const entityId = config.samlIssuer || `${API_URL}/api/sso/saml/metadata/${configId}`;

    return `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata"
  entityID="${entityId}">
  <SPSSODescriptor AuthnRequestsSigned="false"
    WantAssertionsSigned="true"
    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
    <AssertionConsumerService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${callbackUrl}"
      index="1" />
  </SPSSODescriptor>
</EntityDescriptor>`;
  }
}
