// src/app/session/session.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Session } from '../entities/session.entity';
import { SessionData } from '../entities/session-data.entity';
import { Patient } from '../../users/entities/patient.entity';
import { User } from '../../users/entities/user.entity';
import { CreateSessionDto } from '../dtos/create-session.dto';
import { CreateSessionDataDto } from '../dtos/create-session-data.dto';

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
      throw new BadRequestException('There is already an active session');
    }

    const patient = await this.patientRepo.findOne({
      where: { id: dto.patientId },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    const session = this.sessionRepo.create({ patient, deviceId: dto.deviceId });
    return this.sessionRepo.save(session);
  }

  async findActiveSession(): Promise<Session | null> {
    return this.sessionRepo.findOne({
      where: { endedAt: null },
      relations: ['patient'],
      order: { startedAt: 'DESC' },
    });
  }

  async findActiveByDevice(deviceId: string): Promise<Session | null> {
    return this.sessionRepo.findOne({
      where: { deviceId, endedAt: null },
      relations: ['patient'],
      order: { startedAt: 'DESC' },
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
      oxygenSaturation: dto.oxygenSaturation,
      temperatureC: dto.temperatureC,
      systolic: dto.systolic,
      diastolic: dto.diastolic,
    });

    return this.dataRepo.save(record);
  }

  async addSessionDataFromTelemetry(
    session: Session,
    payload: {
      pulse: number;
      oxygenSaturation: number;
      temperatureC: number;
      systolic: number;
      diastolic: number;
      ambientTemperatureC?: number;
      fingerDetected: boolean;
      monitoringEnabled: boolean;
      calibrationComplete: boolean;
      respirationDetected: boolean;
      respirationMissing: boolean;
      warningActive: boolean;
      alertActive: boolean;
    },
  ): Promise<SessionData> {
    const record = this.dataRepo.create({ session, ...payload });
    return this.dataRepo.save(record);
  }

  async closeSession(sessionId: string): Promise<Session> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('Session not found');
    if (session.endedAt) return session; // idempotente

    session.endedAt = new Date();
    return this.sessionRepo.save(session);
  }

  async findByPatient(patientId: string): Promise<Session[]> {
    const patientExists = await this.patientRepo.exist({
      where: { id: patientId },
    });
    if (!patientExists) throw new NotFoundException('Patient not found');

    return this.sessionRepo.find({
      where: { patient: { id: patientId } },
      relations: ['records', 'patient'],
      order: { startedAt: 'DESC', records: { recordedAt: 'ASC' } },
    });
  }

  async getAll(): Promise<Session[]> {
    return this.sessionRepo.find({
      relations: ['records', 'patient'],
      order: { startedAt: 'DESC', records: { recordedAt: 'ASC' } },
    });
  }

  async getPatientOwnSessions(userId: string): Promise<Session[]> {
    const patient = await this.findPatientByUserId(userId);
    return this.findByPatient(patient.id);
  }

  async getPatientOwnStatus(userId: string) {
    const patient = await this.findPatientByUserId(userId);
    const activeSession = await this.sessionRepo.findOne({
      where: { patient: { id: patient.id }, endedAt: null },
      relations: ['records', 'patient'],
      order: { startedAt: 'DESC', records: { recordedAt: 'DESC' } },
    });

    const latestSession =
      activeSession ??
      (await this.sessionRepo.findOne({
        where: { patient: { id: patient.id } },
        relations: ['records', 'patient'],
        order: { startedAt: 'DESC', records: { recordedAt: 'DESC' } },
      }));

    const latestRecord = latestSession?.records?.at(-1) ?? null;

    return {
      patient,
      inTreatment: Boolean(activeSession),
      activeSession,
      latestSession,
      latestRecord,
    };
  }
}
