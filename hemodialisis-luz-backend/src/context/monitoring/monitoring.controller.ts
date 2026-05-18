import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { SessionService } from 'src/app/sesion/services/session.service';
import { MonitoringService } from './monitoring.service';
import { StartMonitoringDto } from './dtos/start-monitoring.dto';

const DEVICE_ID = 'esp32-luz-01';

@Controller('monitoring')
export class MonitoringController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly monitoringService: MonitoringService,
  ) {}

  @Get('status')
  async getStatus() {
    const activeSession = await this.sessionService.findActiveSession();
    return {
      activeSession,
      deviceId: DEVICE_ID,
      ...this.monitoringService.getRuntimeStatus(),
    };
  }

  @Post('start')
  async start(@Body() dto: StartMonitoringDto) {
    return this.sessionService.createSession({
      patientId: dto.patientId,
      deviceId: DEVICE_ID,
    });
  }

  @Patch('stop')
  async stop() {
    const activeSession = await this.sessionService.findActiveSession();
    if (!activeSession) {
      return { message: 'No active session' };
    }
    return this.sessionService.closeSession(activeSession.id);
  }
}
