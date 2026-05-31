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
    const session = await this.sessionService.createSession({
      patientId: dto.patientId,
      deviceId: DEVICE_ID,
    });
    this.monitoringService.publishControl(DEVICE_ID, 'start');
    this.monitoringService.publishSessionState(DEVICE_ID, session);
    return session;
  }

  @Patch('stop')
  async stop() {
    const activeSession = await this.sessionService.findActiveSession();
    if (!activeSession) {
      this.monitoringService.publishControl(DEVICE_ID, 'stop');
      return { message: 'No active session' };
    }
    const closedSession = await this.sessionService.closeSession(activeSession.id);
    this.monitoringService.publishControl(DEVICE_ID, 'stop');
    this.monitoringService.publishSessionState(DEVICE_ID, null);
    return closedSession;
  }
}
