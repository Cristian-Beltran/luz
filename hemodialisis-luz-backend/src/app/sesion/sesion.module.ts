// src/app/session/session.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Session } from './entities/session.entity';
import { SessionData } from './entities/session-data.entity';
import { Patient } from '../users/entities/patient.entity';
import { User } from '../users/entities/user.entity';
import { SessionService } from './services/session.service';
import { SessionController } from './api/session.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Session, SessionData, Patient, User])],
  providers: [SessionService],
  controllers: [SessionController],
  exports: [SessionService],
})
export class SessionModule {}
