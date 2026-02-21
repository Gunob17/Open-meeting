import knex, { Knex } from 'knex';
import path from 'path';
import fs from 'fs';
import { getDbConfig } from '../config/database.config';

let db: Knex;

export function getDb(): Knex {
  if (!db) {
    // Ensure data directory exists for SQLite
    const dbType = process.env.DB_TYPE || 'sqlite';
    if (dbType === 'sqlite') {
      const dataDir = path.join(__dirname, '../../data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
    }
    db = knex(getDbConfig());
  }
  return db;
}

export async function initializeDatabase(): Promise<void> {
  const database = getDb();

  // Run migrations
  await database.migrate.latest();

  // Run seeds (only inserts if not exists)
  await database.seed.run();
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.destroy();
  }
}

export default getDb;
