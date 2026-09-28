import { registerAs } from '@nestjs/config';
import type { JwtSignOptions } from '@nestjs/jwt';

export interface JwtConfiguration {
  accessSecret: string;
  accessExpiresIn: JwtSignOptions['expiresIn'];
  refreshSecret: string;
  refreshExpiresIn: JwtSignOptions['expiresIn'];
}

function getRequiredEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export default registerAs(
  'jwt',
  (): JwtConfiguration => ({
    accessSecret: getRequiredEnvironmentVariable('JWT_ACCESS_SECRET'),
    accessExpiresIn: getRequiredEnvironmentVariable(
      'JWT_ACCESS_EXPIRES_IN',
    ) as JwtSignOptions['expiresIn'],
    refreshSecret: getRequiredEnvironmentVariable('JWT_REFRESH_SECRET'),
    refreshExpiresIn: getRequiredEnvironmentVariable(
      'JWT_REFRESH_EXPIRES_IN',
    ) as JwtSignOptions['expiresIn'],
  }),
);
