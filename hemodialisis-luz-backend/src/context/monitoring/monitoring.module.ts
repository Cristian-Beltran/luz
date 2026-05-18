import { Module } from '@nestjs/common';
import { SessionModule } from 'src/app/sesion/sesion.module';
import { MonitoringController } from './monitoring.controller';
import { MonitoringGateway } from './monitoring.gateway';
import { MonitoringService } from './monitoring.service';

@Module({
  imports: [SessionModule],
  controllers: [MonitoringController],
  providers: [MonitoringGateway, MonitoringService],
})
export class MonitoringModule {}
