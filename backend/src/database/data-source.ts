import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataSource } from 'typeorm';

const currentDirectory = dirname(fileURLToPath(import.meta.url));

function getRequiredEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getDatabasePort(): number {
  const value = process.env.DB_PORT ?? '5432';
  const port = Number(value);

  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`Invalid DB_PORT: ${value}`);
  }

  return port;
}

function getBooleanEnvironmentVariable(
  name: string,
  defaultValue: boolean,
): boolean {
  const value = process.env[name];

  if (value === undefined || value === '') {
    return defaultValue;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw new Error(`Invalid ${name}: expected true or false`);
}

function getDatabaseSsl():
  | false
  | { rejectUnauthorized: boolean; ca?: string } {
  if (!getBooleanEnvironmentVariable('DB_SSL', false)) {
    return false;
  }

  const caPath = process.env.DB_SSL_CA_PATH?.trim();

  return {
    rejectUnauthorized: getBooleanEnvironmentVariable(
      'DB_SSL_REJECT_UNAUTHORIZED',
      true,
    ),
    ...(caPath && {
      ca: readFileSync(resolve(caPath), 'utf8'),
    }),
  };
}

const dataSource = new DataSource({
  type: 'postgres',
  host: getRequiredEnvironmentVariable('DB_HOST'),
  port: getDatabasePort(),
  username: getRequiredEnvironmentVariable('DB_USERNAME'),
  password: getRequiredEnvironmentVariable('DB_PASSWORD'),
  database: getRequiredEnvironmentVariable('DB_NAME'),
  ssl: getDatabaseSsl(),
  entities: [join(currentDirectory, '../modules/**/*.entity{.ts,.js}')],
  migrations: [join(currentDirectory, 'migrations/*{.ts,.js}')],
  migrationsTableName: 'migrations',
  migrationsRun: false,
  synchronize: false,
});

export default dataSource;
