import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { SessionService } from 'src/app/sesion/services/session.service';
import { MonitoringService } from './monitoring.service';
import { StartMonitoringDto } from './dtos/start-monitoring.dto';
import { DevicePowerDto } from './dtos/device-power.dto';
import { WhatsAppService } from 'src/context/whatsapp/whatsapp.service';

const DEVICE_ID = 'esp32-luz-01';

@Controller('monitoring')
export class MonitoringController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly monitoringService: MonitoringService,
    private readonly whatsAppService: WhatsAppService,
  ) {}

  @Get('status')
  async getStatus() {
    const activeSession = await this.sessionService.findActiveSession();
    const recentAiMessages = activeSession
      ? await this.sessionService.getAiMessages(activeSession.id, 5)
      : [];
    return {
      activeSession,
      recentAiMessages,
      deviceId: DEVICE_ID,
      ...this.monitoringService.getRuntimeStatus(),
    };
  }

  @Post('start')
  async start(@Body() dto: StartMonitoringDto) {
    const session = await this.sessionService.createSession({
      deviceId: DEVICE_ID,
      patientId: dto.patientId,
      weightBefore: dto.weightBefore,
      weightAfter: dto.weightAfter,
      dryWeight: dto.dryWeight,
      reportedSymptoms: dto.reportedSymptoms,
      dizziness: dto.dizziness,
      nausea: dto.nausea,
      cramps: dto.cramps,
      pain: dto.pain,
      shortnessOfBreath: dto.shortnessOfBreath,
      weakness: dto.weakness,
      chills: dto.chills,
      staffObservations: dto.staffObservations,
    });
    this.monitoringService.setDevicePower(DEVICE_ID, true);
    this.monitoringService.publishSessionState(DEVICE_ID, session);
    this.monitoringService.publishAiInsights(DEVICE_ID, []);
    this.monitoringService.publishControl(DEVICE_ID, 'power_on');
    return session;
  }

  @Patch('power')
  async power(@Body() dto: DevicePowerDto) {
    this.monitoringService.setDevicePower(DEVICE_ID, dto.state === 'on');
    this.monitoringService.publishCurrentSessionState(DEVICE_ID);
    return {
      ok: this.monitoringService.publishControl(
        DEVICE_ID,
        dto.state === 'on' ? 'power_on' : 'power_off',
      ),
      state: dto.state,
    };
  }

  @Patch('stop')
  async stop() {
    const activeSession = await this.sessionService.findActiveSession();
    if (!activeSession) {
      this.monitoringService.setDevicePower(DEVICE_ID, false);
      this.monitoringService.publishControl(DEVICE_ID, 'power_off');
      return { message: 'No active session' };
    }
    const closedSession = await this.sessionService.closeSession(activeSession.id);
    this.monitoringService.setDevicePower(DEVICE_ID, false);
    this.monitoringService.publishControl(DEVICE_ID, 'power_off');
    this.monitoringService.publishSessionState(DEVICE_ID, null);
    this.monitoringService.publishAiInsights(DEVICE_ID, []);
    void this.whatsAppService.sendSessionReport(closedSession.id);
    return closedSession;
  }
}
