import { Module } from '@nestjs/common';
import { SessionModule } from 'src/app/sesion/sesion.module';
import { WhatsAppModule } from 'src/context/whatsapp/whatsapp.module';
import { MonitoringController } from './monitoring.controller';
import { MonitoringGateway } from './monitoring.gateway';
import { MonitoringService } from './monitoring.service';

@Module({
  imports: [SessionModule, WhatsAppModule],
  controllers: [MonitoringController],
  providers: [MonitoringGateway, MonitoringService],
})
export class MonitoringModule {}
