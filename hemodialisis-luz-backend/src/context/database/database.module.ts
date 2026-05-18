import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import config from 'src/context/shared/config';
import { ConfigType } from '@nestjs/config';
import { MigrationController } from './database.controller';
@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [config.KEY],
      useFactory: (configService: ConfigType<typeof config>) => {
        return {
          type: 'sqlite' as const,
          database: configService.database.sqlitePath,
          autoLoadEntities: true,
          synchronize: false,
        };
      },
    }),
  ],
  controllers: [MigrationController],
})
export class DatabaseModule {}
