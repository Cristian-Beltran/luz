import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { connect, MqttClient } from 'mqtt';
import { SessionService } from 'src/app/sesion/services/session.service';

type TelemetryPayload = {
  deviceId?: string;
  heartRateBpm?: number;
  spo2?: number;
  temperatureC?: number;
  ambientTemperatureC?: number;
  estimatedSystolicMmHg?: number;
  estimatedDiastolicMmHg?: number;
  fingerDetected?: boolean;
  monitoringEnabled?: boolean;
  calibrationComplete?: boolean;
  respirationDetected?: boolean;
  respirationMissing?: boolean;
  warningActive?: boolean;
  alertActive?: boolean;
};

@Injectable()
export class MonitoringService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MonitoringService.name);
  private client: MqttClient | null = null;
  private readonly persistIntervalMs = 10_000;
  private readonly espTimeoutMs = 15_000;
  private lastSeenAt: Date | null = null;
  private lastPersistAtBySession = new Map<string, number>();
  private lastTelemetry: (TelemetryPayload & { deviceId: string; receivedAt: string }) | null =
    null;

  constructor(private readonly sessionService: SessionService) {}

  onModuleInit() {
    const url = 'mqtt://broker.hivemq.com:1883';
    const topic = 'luz/device/+/telemetry';

    this.client = connect(url, {
      clientId: `backend-${Math.random().toString(16).slice(2, 8)}`,
    });

    this.client.on('connect', () => {
      this.logger.log(`MQTT connected: ${url}`);
      this.client?.subscribe(topic, (err) => {
        if (err) this.logger.error(`Subscribe error: ${err.message}`);
        else this.logger.log(`Subscribed to ${topic}`);
      });
    });

    this.client.on('message', async (topicName, buffer) => {
      const payload = this.parsePayload(buffer.toString());
      if (!payload) return;

      const topicDeviceId = this.getDeviceIdFromTopic(topicName);
      const deviceId = payload.deviceId ?? topicDeviceId;
      if (!deviceId) return;

      this.lastSeenAt = new Date();
      this.lastTelemetry = {
        ...payload,
        deviceId,
        receivedAt: this.lastSeenAt.toISOString(),
      };

      const session = await this.sessionService.findActiveByDevice(deviceId);
      if (!session) return;

      const now = Date.now();
      const lastPersistAt = this.lastPersistAtBySession.get(session.id) ?? 0;
      if (now - lastPersistAt < this.persistIntervalMs) {
        return;
      }
      this.lastPersistAtBySession.set(session.id, now);

      await this.sessionService.addSessionDataFromTelemetry(session, {
        pulse: this.clamp(payload.heartRateBpm, 20, 250, 0),
        oxygenSaturation: this.clamp(payload.spo2, 0, 100, 0),
        temperatureC: this.clamp(payload.temperatureC, 30, 45, 0),
        systolic: this.clamp(payload.estimatedSystolicMmHg, 50, 260, 0),
        diastolic: this.clamp(payload.estimatedDiastolicMmHg, 30, 200, 0),
        ambientTemperatureC: payload.ambientTemperatureC,
        fingerDetected: Boolean(payload.fingerDetected),
        monitoringEnabled: Boolean(payload.monitoringEnabled),
        calibrationComplete: Boolean(payload.calibrationComplete),
        respirationDetected: Boolean(payload.respirationDetected),
        respirationMissing: Boolean(payload.respirationMissing),
        warningActive: Boolean(payload.warningActive),
        alertActive: Boolean(payload.alertActive),
      });
    });

    this.client.on('error', (err) => {
      this.logger.error(`MQTT error: ${err?.message ?? 'unknown error'}`);
    });
  }

  onModuleDestroy() {
    this.client?.end(true);
  }

  getRuntimeStatus() {
    const now = Date.now();
    const lastSeenTime = this.lastSeenAt?.getTime() ?? 0;
    const espOnline = lastSeenTime > 0 && now - lastSeenTime <= this.espTimeoutMs;

    return {
      espOnline,
      lastSeenAt: this.lastSeenAt?.toISOString() ?? null,
      lastTelemetry: this.lastTelemetry,
      persistIntervalSeconds: this.persistIntervalMs / 1000,
    };
  }

  private parsePayload(raw: string): TelemetryPayload | null {
    try {
      return JSON.parse(raw) as TelemetryPayload;
    } catch {
      return null;
    }
  }

  private getDeviceIdFromTopic(topic: string): string | null {
    const parts = topic.split('/');
    if (parts.length < 4) return null;
    return parts[2] || null;
  }

  private clamp(
    value: number | undefined,
    min: number,
    max: number,
    fallback: number,
  ): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
  }
}
