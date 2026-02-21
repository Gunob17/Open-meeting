import type { Knex } from 'knex';
import path from 'path';

export type DbType = 'sqlite' | 'postgres' | 'mysql' | 'mariadb' | 'mssql';

export function getDbConfig(): Knex.Config {
  const dbType = (process.env.DB_TYPE || 'sqlite') as DbType;

  // Require DB_PASSWORD for non-SQLite databases in production
  if (dbType !== 'sqlite' && !process.env.DB_PASSWORD && process.env.NODE_ENV === 'production') {
    throw new Error(`DB_PASSWORD environment variable is required for ${dbType} in production`);
  }
  const ext = __filename.endsWith('.ts') ? 'ts' : 'js';

  const commonPool = {
    min: 2,
    max: 10,
  };

  const migrationConfig = {
    directory: path.join(__dirname, '../migrations'),
    extension: ext,
    loadExtensions: [`.${ext}`],
  };

  const seedConfig = {
    directory: path.join(__dirname, '../seeds'),
    extension: ext,
    loadExtensions: [`.${ext}`],
  };

  switch (dbType) {
    case 'postgres':
      return {
        client: 'pg',
        connection: {
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432'),
          database: process.env.DB_NAME || 'meeting_booking',
          user: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || '',
        },
        pool: commonPool,
        migrations: migrationConfig,
        seeds: seedConfig,
      };

    case 'mysql':
    case 'mariadb':
      return {
        client: 'mysql2',
        connection: {
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '3306'),
          database: process.env.DB_NAME || 'meeting_booking',
          user: process.env.DB_USER || 'root',
          password: process.env.DB_PASSWORD || '',
          charset: 'utf8mb4',
        },
        pool: commonPool,
        migrations: migrationConfig,
        seeds: seedConfig,
      };

    case 'mssql':
      return {
        client: 'tedious',
        connection: {
          server: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '1433'),
          database: process.env.DB_NAME || 'meeting_booking',
          user: process.env.DB_USER || 'sa',
          password: process.env.DB_PASSWORD || '',
          options: {
            encrypt: process.env.DB_ENCRYPT === 'true',
            trustServerCertificate: true,
          },
        },
        pool: commonPool,
        migrations: migrationConfig,
        seeds: seedConfig,
      };

    case 'sqlite':
    default:
      return {
        client: 'better-sqlite3',
        connection: {
          filename: path.join(__dirname, '../../data/meeting_booking.db'),
        },
        useNullAsDefault: true,
        pool: {
          afterCreate: (conn: any, cb: Function) => {
            conn.pragma('foreign_keys = ON');
            cb();
          },
        },
        migrations: migrationConfig,
        seeds: seedConfig,
      };
  }
}
