import { registerAs } from '@nestjs/config';

export default registerAs('config', () => {
  return {
    database: {
      type: 'sqlite',
      sqlitePath: 'data/luz.sqlite',
      name: 'database',
      port: 5432,
      user: 'root',
      password: 'password',
      host: 'localhost',
    },
    apiKey: 'local-api-key',
    jwtSecret: 'local-dev-jwt-secret',
    openAiApiKey: process.env.OPENAI_API_KEY ?? '',
    whatsAppDefaultCountryCode:
      process.env.WHATSAPP_DEFAULT_COUNTRY_CODE ?? '57',
  };
});
