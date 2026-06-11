import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, MqttClient } from 'mqtt';
import { Session } from 'src/app/sesion/entities/session.entity';
import { SessionService } from 'src/app/sesion/services/session.service';
import { SessionAiMessage } from 'src/app/sesion/entities/session-ai-message.entity';

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
  private readonly aiIntervalMs = 60_000;
  private readonly aiRateLimitCooldownMs = 15 * 60_000;
  private lastSeenAt: Date | null = null;
  private lastPersistAtBySession = new Map<string, number>();
  private lastAiAtBySession = new Map<string, number>();
  private aiBlockedUntilBySession = new Map<string, number>();
  private generatingAiBySession = new Set<string>();
  private devicePowerByDevice = new Map<string, boolean>();
  private lastTelemetry: (TelemetryPayload & { deviceId: string; receivedAt: string }) | null =
    null;

  constructor(
    private readonly sessionService: SessionService,
    private readonly configService: ConfigService,
  ) {}

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
      void this.publishCurrentSessionState('esp32-luz-01');
      void this.publishCurrentAiInsights('esp32-luz-01');
    });

    this.client.on('message', async (topicName, buffer) => {
      const topicDeviceId = this.getDeviceIdFromTopic(topicName);
      const payload = this.parsePayload(buffer.toString());
      const payloadDeviceId = payload?.deviceId;
      const deviceId = payloadDeviceId ?? topicDeviceId;
      if (!deviceId) return;

      this.lastSeenAt = new Date();
      if (!payload) {
        return;
      }

      const sanitizedPayload = this.sanitizePayload(payload);
      this.devicePowerByDevice.set(
        deviceId,
        Boolean(sanitizedPayload.monitoringEnabled),
      );
      this.lastTelemetry = {
        ...sanitizedPayload,
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
        pulse: this.clamp(sanitizedPayload.heartRateBpm, 20, 250, 0),
        oxygenSaturation: this.clamp(sanitizedPayload.spo2, 0, 100, 0),
        temperatureC: this.clamp(sanitizedPayload.temperatureC, 30, 45, 0),
        systolic: this.clamp(sanitizedPayload.estimatedSystolicMmHg, 50, 260, 0),
        diastolic: this.clamp(sanitizedPayload.estimatedDiastolicMmHg, 30, 200, 0),
        ambientTemperatureC: sanitizedPayload.ambientTemperatureC,
        fingerDetected: Boolean(sanitizedPayload.fingerDetected),
        monitoringEnabled: Boolean(sanitizedPayload.monitoringEnabled),
        calibrationComplete: Boolean(sanitizedPayload.calibrationComplete),
        respirationDetected: Boolean(sanitizedPayload.respirationDetected),
        respirationMissing: Boolean(sanitizedPayload.respirationMissing),
        warningActive: Boolean(sanitizedPayload.warningActive),
        alertActive: Boolean(sanitizedPayload.alertActive),
      });

      void this.generateAiInsightIfNeeded(deviceId, session.id, sanitizedPayload);
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
      devicePowerOn: this.devicePowerByDevice.get('esp32-luz-01') ?? false,
      lastSeenAt: this.lastSeenAt?.toISOString() ?? null,
      lastTelemetry: this.lastTelemetry,
      persistIntervalSeconds: this.persistIntervalMs / 1000,
    };
  }

  setDevicePower(deviceId: string, powerOn: boolean) {
    this.devicePowerByDevice.set(deviceId, powerOn);
  }

  publishControl(
    deviceId: string,
    command: 'start' | 'stop' | 'power_on' | 'power_off',
  ): boolean {
    if (!this.client?.connected) return false;
    const topic = `luz/device/${deviceId}/control`;
    const payload = JSON.stringify({ command });
    this.client.publish(topic, payload);
    return true;
  }

  publishSessionState(deviceId: string, session: Session | null): boolean {
    if (!this.client?.connected) return false;

    const topic = `luz/device/${deviceId}/session`;
    const payload = JSON.stringify({
      deviceId,
      active: Boolean(session && !session.endedAt),
      sessionId: session?.id ?? null,
      startedAt: session?.startedAt ?? null,
      endedAt: session?.endedAt ?? null,
      powerOn: this.devicePowerByDevice.get(deviceId) ?? false,
      patient: session?.patient
        ? {
            id: session.patient.id,
            fullname: session.patient.user?.fullname ?? 'Paciente',
          }
        : null,
      publishedAt: new Date().toISOString(),
    });

    this.client.publish(topic, payload, { retain: true });
    return true;
  }

  async publishCurrentSessionState(deviceId: string): Promise<boolean> {
    const session = await this.sessionService.findActiveByDevice(deviceId);
    return this.publishSessionState(deviceId, session);
  }

  publishAiInsights(deviceId: string, messages: SessionAiMessage[]): boolean {
    if (!this.client?.connected) return false;

    const topic = `luz/device/${deviceId}/ai`;
    this.client.publish(
      topic,
      JSON.stringify({
        deviceId,
        messages: messages.map((message) => ({
          id: message.id,
          message: message.message,
          source: message.source,
          createdAt: message.createdAt,
        })),
        publishedAt: new Date().toISOString(),
      }),
      { retain: true },
    );
    return true;
  }

  async publishCurrentAiInsights(deviceId: string): Promise<boolean> {
    const session = await this.sessionService.findActiveByDevice(deviceId);
    if (!session) {
      return this.publishAiInsights(deviceId, []);
    }

    const messages = await this.sessionService.getAiMessages(session.id, 5);
    return this.publishAiInsights(deviceId, messages.reverse());
  }

  private parsePayload(raw: string): TelemetryPayload | null {
    try {
      return JSON.parse(raw) as TelemetryPayload;
    } catch {
      return null;
    }
  }

  private sanitizePayload(payload: TelemetryPayload): TelemetryPayload {
    return {
      ...payload,
      heartRateBpm: this.toFiniteNumber(payload.heartRateBpm),
      spo2: this.toFiniteNumber(payload.spo2),
      temperatureC: this.toFiniteNumber(payload.temperatureC),
      ambientTemperatureC: this.toFiniteNumber(payload.ambientTemperatureC),
      estimatedSystolicMmHg: this.toFiniteNumber(payload.estimatedSystolicMmHg),
      estimatedDiastolicMmHg: this.toFiniteNumber(payload.estimatedDiastolicMmHg),
    };
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

  private toFiniteNumber(value: number | undefined): number | undefined {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }

  private async generateAiInsightIfNeeded(
    deviceId: string,
    sessionId: string,
    payload: TelemetryPayload,
  ) {
    const apiKey = this.configService.get<string>('config.openAiApiKey') ?? '';
    if (!apiKey) return;

    const now = Date.now();
    const blockedUntil = this.aiBlockedUntilBySession.get(sessionId) ?? 0;
    if (blockedUntil > now) return;

    const lastAt = this.lastAiAtBySession.get(sessionId) ?? 0;
    if (now - lastAt < this.aiIntervalMs) return;
    if (this.generatingAiBySession.has(sessionId)) return;

    this.lastAiAtBySession.set(sessionId, now);
    this.generatingAiBySession.add(sessionId);

    try {
      const session = await this.sessionService.findOneDetailed(sessionId);
      if (!session) return;

      const message = await this.requestAiInsight(apiKey, session, payload);
      if (!message) return;

      this.aiBlockedUntilBySession.delete(sessionId);
      await this.sessionService.addAiMessage(sessionId, message);
      await this.publishCurrentAiInsights(deviceId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      if (this.isOpenAiRateLimitError(error)) {
        this.aiBlockedUntilBySession.set(
          sessionId,
          Date.now() + this.aiRateLimitCooldownMs,
        );
        this.logger.warn(
          `AI insight generation rate limited: ${message}. Retrying in ${Math.round(this.aiRateLimitCooldownMs / 60_000)} minutes.`,
        );
        return;
      }
      this.logger.warn(`AI insight generation failed: ${message}`);
    } finally {
      this.generatingAiBySession.delete(sessionId);
    }
  }

  private isOpenAiRateLimitError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    return error.message.includes('OpenAI 429');
  }

  private async requestAiInsight(
    apiKey: string,
    session: Session,
    payload: TelemetryPayload,
  ): Promise<string | null> {
    const recentRecords = (session.records ?? []).slice(-6).map((record) => ({
      recordedAt: record.recordedAt,
      pulse: record.pulse,
      oxygenSaturation: record.oxygenSaturation,
      temperatureC: record.temperatureC,
      systolic: record.systolic,
      diastolic: record.diastolic,
      warningActive: record.warningActive,
      alertActive: record.alertActive,
    }));

    const symptoms = [
      session.dizziness ? 'mareos' : null,
      session.nausea ? 'nausea' : null,
      session.cramps ? 'calambres' : null,
      session.pain ? 'dolor' : null,
      session.shortnessOfBreath ? 'falta de aire' : null,
      session.weakness ? 'debilidad' : null,
      session.chills ? 'escalofrios' : null,
    ].filter(Boolean);

    const prompt = {
      patient: {
        name: session.patient.user.fullname,
        age: session.patient.age,
        sex: session.patient.sex,
        patientType: session.patient.patientType,
        baseDisease: session.patient.baseDisease,
        knownAllergies: session.patient.knownAllergies,
        antecedentes: {
          diabetes: session.patient.hasDiabetes,
          hipertension: session.patient.hasHypertension,
          enfermedadCardiaca: session.patient.hasHeartDisease,
          anemia: session.patient.hasAnemia,
          infeccionesPrevias: session.patient.hasPreviousInfections,
        },
      },
      session: {
        startedAt: session.startedAt,
        weightBefore: session.weightBefore,
        weightAfter: session.weightAfter,
        dryWeight: session.dryWeight,
        sessionDurationMinutes: session.sessionDurationMinutes,
        reportedSymptoms: session.reportedSymptoms,
        symptomFlags: symptoms,
        staffObservations: session.staffObservations,
      },
      latestTelemetry: payload,
      recentRecords,
    };

    const response = await globalThis.fetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content:
                'Eres un asistente clinico de apoyo para hemodialisis. Responde en espanol, en maximo 3 frases breves. Indica estado general del paciente y puntos a vigilar sin diagnosticos definitivos.',
            },
            {
              role: 'user',
              content: `Analiza esta sesion de hemodialisis y entrega un mensaje breve para mostrar en una tablet clinica: ${JSON.stringify(prompt)}`,
            },
          ],
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`OpenAI ${response.status}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  }
}
