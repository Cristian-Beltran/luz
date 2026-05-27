import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';

const configService = new ConfigService();

const dbType = 'sqlite';

const baseOptions = {
  synchronize: true,
  logging: true,
  entities: [
    path.resolve(__dirname, '..', '..', 'app', '**', '*.entity.{ts,js}'),
  ],
  migrations:
    dbType === 'sqlite'
      ? [path.resolve(__dirname, 'migrations', 'sqlite', '*{.ts,.js}')]
      : [path.resolve(__dirname, 'migrations', 'postgres', '*{.ts,.js}')],
  migrationsTableName: 'migrations',
};

const dataSource =
  dbType === 'sqlite'
    ? new DataSource({
        type: 'sqlite',
        database: configService.get<string>('SQLITE_PATH') ?? 'data/luz.sqlite',
        ...baseOptions,
      })
    : new DataSource({
        type: 'postgres',
        username: configService.get('DB_USER'),
        password: configService.get('DB_PASSWORD'),
        database: configService.get('DB_NAME'),
        port: configService.get<number>('DB_PORT'),
        host: configService.get('DB_HOST'),
        ...baseOptions,
      });

export default dataSource;
