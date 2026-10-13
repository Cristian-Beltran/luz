// src/app/session/session.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Session } from '../entities/session.entity';
import { SessionData } from '../entities/session-data.entity';
import { SessionAiMessage } from '../entities/session-ai-message.entity';
import { SessionEvent } from '../entities/session-event.entity';
import { Patient } from '../../users/entities/patient.entity';
import { User } from '../../users/entities/user.entity';
import { CreateSessionDto } from '../dtos/create-session.dto';
import { CreateSessionDataDto } from '../dtos/create-session-data.dto';

const DEFAULT_DEVICE_ID = 'esp32-luz-01';

@Injectable()
export class SessionService {
  constructor(
    @InjectRepository(Session)
    private readonly sessionRepo: Repository<Session>,
    @InjectRepository(SessionData)
    private readonly dataRepo: Repository<SessionData>,
    @InjectRepository(Patient)
    private readonly patientRepo: Repository<Patient>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(SessionAiMessage)
    private readonly aiMessageRepo: Repository<SessionAiMessage>,
    @InjectRepository(SessionEvent)
    private readonly eventRepo: Repository<SessionEvent>,
  ) {}

  async findPatientByUserId(userId: string): Promise<Patient> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const patient = await this.patientRepo.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });
    if (!patient) throw new NotFoundException('Patient profile not found');
    return patient;
  }

  async createSession(dto: CreateSessionDto): Promise<Session> {
    const activeSession = await this.findActiveSession();
    if (activeSession) {
      activeSession.endedAt = new Date();
      await this.sessionRepo.save(activeSession);
    }

    const patient = await this.patientRepo.findOne({
      where: { id: dto.patientId },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    const session = this.sessionRepo.create({
      patient,
      deviceId: dto.deviceId?.trim() || DEFAULT_DEVICE_ID,
      weightBefore: dto.weightBefore,
      dryWeight: dto.dryWeight,
      ultrafiltrationGoalLiters: this.calculateUltrafiltration(
        dto.weightBefore,
        dto.dryWeight,
      ),
      pressureIntervalMinutes: dto.pressureIntervalMinutes ?? 30,
      reportedSymptoms: dto.reportedSymptoms,
      dizziness: Boolean(dto.dizziness),
      nausea: Boolean(dto.nausea),
      cramps: Boolean(dto.cramps),
      pain: Boolean(dto.pain),
      shortnessOfBreath: Boolean(dto.shortnessOfBreath),
      weakness: Boolean(dto.weakness),
      chills: Boolean(dto.chills),
      staffObservations: dto.staffObservations,
    });
    const saved = await this.sessionRepo.save(session);
    await this.addEvent(saved.id, 'session_started', 'system', 'Sesion iniciada');
    return saved;
  }

  async findActiveSession(): Promise<Session | null> {
    return this.sessionRepo.findOne({
      where: { endedAt: null },
      order: { startedAt: 'DESC' },
    });
  }

  async findActiveByDevice(deviceId: string): Promise<Session | null> {
    return this.sessionRepo.findOne({
      where: { deviceId, endedAt: null },
      relations: ['patient', 'patient.user'],
      order: { startedAt: 'DESC' },
    });
  }

  async findOneDetailed(sessionId: string): Promise<Session | null> {
    return this.sessionRepo.findOne({
      where: { id: sessionId },
      relations: ['patient', 'records', 'aiMessages', 'events'],
      order: {
        records: { recordedAt: 'ASC' },
        aiMessages: { createdAt: 'DESC' },
        events: { createdAt: 'DESC' },
      },
    });
  }

  async addSessionData(
    sessionId: string,
    dto: CreateSessionDataDto,
  ): Promise<SessionData> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('Session not found');

    const record = this.dataRepo.create({
      session,
      pulse: dto.pulse,
      temperatureC: dto.temperatureC,
      systolic: dto.systolic,
      diastolic: dto.diastolic,
      respiratoryRateBpm: dto.respiratoryRateBpm,
    });

    return this.dataRepo.save(record);
  }

  async addSessionDataFromTelemetry(
    session: Session,
    payload: {
      pulse: number;
      temperatureC: number;
      systolic: number;
      diastolic: number;
      ambientTemperatureC?: number;
      fingerDetected: boolean;
      monitoringEnabled: boolean;
      calibrationComplete: boolean;
      respirationDetected: boolean;
      respirationMissing: boolean;
      respiratoryRateBpm: number;
      warningActive: boolean;
      alertActive: boolean;
    },
  ): Promise<SessionData> {
    const record = this.dataRepo.create({ session, ...payload });
    return this.dataRepo.save(record);
  }

  async closeSession(sessionId: string, weightAfter?: number): Promise<Session> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('Session not found');
    if (session.endedAt) return session; // idempotente

    if (weightAfter !== undefined) {
      session.weightAfter = weightAfter;
      session.ultrafiltrationActualLiters = this.calculateUltrafiltration(
        session.weightBefore,
        weightAfter,
      );
    }
    session.endedAt = new Date();
    session.sessionDurationMinutes = Math.max(
      1,
      Math.round(
        (session.endedAt.getTime() - session.startedAt.getTime()) / 60_000,
      ),
    );
    const saved = await this.sessionRepo.save(session);
    await this.addEvent(saved.id, 'session_closed', 'system', 'Sesion finalizada', {
      weightAfter: saved.weightAfter,
      ultrafiltrationActualLiters: saved.ultrafiltrationActualLiters,
    });
    return saved;
  }

  async markReportSent(sessionId: string): Promise<void> {
    await this.sessionRepo.update(sessionId, { reportSentAt: new Date() });
  }

  async addEvent(
    sessionId: string,
    type: string,
    source: string,
    description: string,
    metadata?: Record<string, unknown>,
  ): Promise<SessionEvent> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');
    return this.eventRepo.save(
      this.eventRepo.create({
        session,
        type,
        source,
        description,
        metadata: metadata ? JSON.stringify(metadata) : undefined,
      }),
    );
  }

  async markPressureMeasured(
    sessionId: string,
    systolic: number,
    diastolic: number,
    source: string,
  ): Promise<void> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) return;
    session.lastPressureAt = new Date();
    await this.sessionRepo.save(session);
    await this.addEvent(
      sessionId,
      'pressure_completed',
      source,
      `Presion arterial ${systolic}/${diastolic} mmHg`,
      { systolic, diastolic },
    );
  }

  async addAiMessage(sessionId: string, message: string): Promise<SessionAiMessage> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');

    const entity = this.aiMessageRepo.create({
      session,
      message,
      source: 'openai',
    });

    return this.aiMessageRepo.save(entity);
  }

  async getAiMessages(sessionId: string, limit = 5): Promise<SessionAiMessage[]> {
    return this.aiMessageRepo.find({
      where: { session: { id: sessionId } },
      relations: ['session'],
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async getEvents(sessionId: string, limit = 30): Promise<SessionEvent[]> {
    return this.eventRepo.find({
      where: { session: { id: sessionId } },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async findByPatient(patientId: string): Promise<Session[]> {
    const patientExists = await this.patientRepo.exist({
      where: { id: patientId },
    });
    if (!patientExists) throw new NotFoundException('Patient not found');

    return this.sessionRepo.find({
      where: { patient: { id: patientId } },
      relations: ['records', 'patient', 'aiMessages', 'events'],
      order: {
        startedAt: 'DESC',
        records: { recordedAt: 'ASC' },
        aiMessages: { createdAt: 'DESC' },
        events: { createdAt: 'DESC' },
      },
    });
  }

  async getAll(): Promise<Session[]> {
    return this.sessionRepo.find({
      relations: ['records', 'patient', 'aiMessages', 'events'],
      order: {
        startedAt: 'DESC',
        records: { recordedAt: 'ASC' },
        aiMessages: { createdAt: 'DESC' },
        events: { createdAt: 'DESC' },
      },
    });
  }

  async getPatientOwnSessions(userId: string) {
    const patient = await this.findPatientByUserId(userId);
    return this.findPatientSessionSummaries(patient.id);
  }

  async getPatientOwnStatus(userId: string) {
    const patient = await this.findPatientByUserId(userId);
    // The patient PWA calls status, history and evolution together. Loading
    // every record/event/message of every session three times exhausts SQLite
    // and V8. These summaries contain only the newest clinical record needed
    // by the app UI.
    const sessions = await this.findPatientSessionSummaries(patient.id);
    const activeSession = sessions.find((session) => !session.endedAt) ?? null;
    const latestSession = activeSession ?? sessions[0] ?? null;
    const latestRecord = latestSession?.records[0] ?? null;

    return {
      patient,
      inTreatment: Boolean(activeSession),
      activeSession,
      latestSession,
      latestRecord,
    };
  }

  private async findPatientSessionSummaries(patientId: string, limit = 50) {
    const latest = (column: string) =>
      `(SELECT record.${column} FROM session_data record WHERE record.sessionId = session.id ORDER BY record.recordedAt DESC LIMIT 1)`;

    const rows = await this.sessionRepo
      .createQueryBuilder('session')
      .select('session.id', 'id')
      .addSelect('session.startedAt', 'startedAt')
      .addSelect('session.endedAt', 'endedAt')
      .addSelect('session.weightBefore', 'weightBefore')
      .addSelect('session.weightAfter', 'weightAfter')
      .addSelect('session.ultrafiltrationGoalLiters', 'ultrafiltrationGoalLiters')
      .addSelect('session.ultrafiltrationActualLiters', 'ultrafiltrationActualLiters')
      .addSelect('session.reportedSymptoms', 'reportedSymptoms')
      .addSelect(latest('pulse'), 'pulse')
      .addSelect(latest('temperatureC'), 'temperatureC')
      .addSelect(latest('systolic'), 'systolic')
      .addSelect(latest('diastolic'), 'diastolic')
      .addSelect(latest('recordedAt'), 'recordedAt')
      .where('session.patientId = :patientId', { patientId })
      .orderBy('session.startedAt', 'DESC')
      .take(limit)
      .getRawMany<{
        id: string;
        startedAt: string;
        endedAt: string | null;
        weightBefore: number | null;
        weightAfter: number | null;
        ultrafiltrationGoalLiters: number | null;
        ultrafiltrationActualLiters: number | null;
        reportedSymptoms: string | null;
        pulse: number | null;
        temperatureC: number | null;
        systolic: number | null;
        diastolic: number | null;
        recordedAt: string | null;
      }>();

    return rows.map((row) => ({
      id: row.id,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      weightBefore: row.weightBefore,
      weightAfter: row.weightAfter,
      ultrafiltrationGoalLiters: row.ultrafiltrationGoalLiters,
      ultrafiltrationActualLiters: row.ultrafiltrationActualLiters,
      reportedSymptoms: row.reportedSymptoms,
      records: row.recordedAt
        ? [{
            recordedAt: row.recordedAt,
            pulse: row.pulse,
            temperatureC: row.temperatureC,
            systolic: row.systolic,
            diastolic: row.diastolic,
          }]
        : [],
    }));
  }

  private calculateUltrafiltration(
    weightBefore?: number,
    comparisonWeight?: number,
  ): number | undefined {
    if (!Number.isFinite(weightBefore) || !Number.isFinite(comparisonWeight)) {
      return undefined;
    }
    return Math.max(0, Number(((weightBefore as number) - (comparisonWeight as number)).toFixed(2)));
  }
}
