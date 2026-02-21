import { SettingsModel } from '../models/settings.model';
import { ParkModel } from '../models/park.model';
import { CompanyModel } from '../models/company.model';
import { TwoFaEnforcement } from '../types';

/**
 * Resolve the effective 2FA enforcement for a given user's park and company.
 * Cascading: system > park > company.
 * 'required' at any level forces 'required' downstream.
 * 'inherit' defers to the parent level.
 * 'disabled' at system level blocks all downstream enforcement.
 */
export async function getEffectiveTwoFaEnforcement(
  parkId: string | null,
  companyId: string
): Promise<TwoFaEnforcement> {
  const settings = await SettingsModel.getGlobal();
  const systemLevel = settings.twofaEnforcement;

  // System 'required' overrides everything
  if (systemLevel === 'required') return 'required';
  // System 'disabled' blocks all enforcement
  if (systemLevel === 'disabled') return 'disabled';

  // System is 'optional' -- check park level
  let parkLevel = 'inherit';
  if (parkId) {
    const park = await ParkModel.findById(parkId);
    if (park) {
      parkLevel = park.twofaEnforcement || 'inherit';
    }
  }

  if (parkLevel === 'required') return 'required';

  // Resolve park: 'inherit' -> use system level ('optional'), 'optional' stays optional
  const resolvedParkLevel = parkLevel === 'inherit' ? systemLevel : parkLevel;

  // Check company level
  const company = await CompanyModel.findById(companyId);
  const companyLevel = company?.twofaEnforcement || 'inherit';

  if (companyLevel === 'required') return 'required';

  // Company 'inherit' defers to resolved park level
  const resolvedCompanyLevel = companyLevel === 'inherit' ? resolvedParkLevel : companyLevel;

  return resolvedCompanyLevel as TwoFaEnforcement;
}
