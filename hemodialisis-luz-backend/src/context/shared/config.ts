import { registerAs } from '@nestjs/config';

export default registerAs('config', () => {
  return {
    port: parseInt(process.env.PORT ?? '3000', 10),
    database: {
      type: 'sqlite',
      sqlitePath: process.env.SQLITE_PATH ?? 'data/luz.sqlite',
    },
    apiKey: process.env.API_KEY ?? 'local-api-key',
    jwtSecret: process.env.JWT_SECRET ?? 'local-dev-jwt-secret',
    openAiApiKey: process.env.OPENAI_API_KEY ?? '',
    whatsAppDefaultCountryCode:
      process.env.WHATSAPP_DEFAULT_COUNTRY_CODE ?? '57',
    mqtt: {
      url: process.env.MQTT_URL ?? 'mqtt://broker.hivemq.com:1883',
      user: process.env.MQTT_USER ?? '',
      password: process.env.MQTT_PASSWORD ?? '',
    },
    corsOrigins: process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
      : ['http://localhost:5173', 'http://localhost:4173'],
    migrationSecret: process.env.MIGRATION_SECRET ?? '',
  };
});
