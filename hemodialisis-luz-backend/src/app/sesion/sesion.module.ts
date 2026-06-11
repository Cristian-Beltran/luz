// src/app/session/session.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Session } from './entities/session.entity';
import { SessionData } from './entities/session-data.entity';
import { SessionAiMessage } from './entities/session-ai-message.entity';
import { Patient } from '../users/entities/patient.entity';
import { User } from '../users/entities/user.entity';
import { SessionService } from './services/session.service';
import { SessionController } from './api/session.controller';
import { SessionReportService } from './services/session-report.service';
import { PdfModule } from 'src/context/pdf/pdf.module';

@Module({
  imports: [
    PdfModule,
    TypeOrmModule.forFeature([
      Session,
      SessionData,
      SessionAiMessage,
      Patient,
      User,
    ]),
  ],
  providers: [SessionService, SessionReportService],
  controllers: [SessionController],
  exports: [SessionService, SessionReportService],
})
export class SessionModule {}
