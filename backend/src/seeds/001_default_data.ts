import { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  // Insert default settings (idempotent)
  const existingSettings = await knex('settings').where('id', 'global').first();
  if (!existingSettings) {
    await knex('settings').insert({
      id: 'global',
      opening_hour: 8,
      closing_hour: 18,
    });
  }

  // Create default park
  const existingPark = await knex('parks').where('id', 'default').first();
  if (!existingPark) {
    await knex('parks').insert({
      id: 'default',
      name: 'Default Park',
      address: 'Default Location',
      description: 'Default park for existing data',
      is_active: true,
    });
  }

  // Create system company
  const existingSystem = await knex('companies').where('id', 'system').first();
  if (!existingSystem) {
    await knex('companies').insert({
      id: 'system',
      name: 'System',
      address: 'Internal',
    });
  }

  // Create system user for device quick bookings
  const existingDeviceUser = await knex('users').where('id', 'device-booking-user').first();
  if (!existingDeviceUser) {
    await knex('users').insert({
      id: 'device-booking-user',
      email: 'device@system.local',
      password: '',
      name: 'Device Booking',
      role: 'user',
      company_id: 'system',
    });
  }
}
