import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { UserBaseService } from 'src/app/users/services/users.service';
import { Patient } from 'src/app/users/entities/patient.entity';
import { FamilyMember } from 'src/app/users/entities/family.entity';
import { Repository } from 'typeorm';
import { SessionService } from 'src/app/sesion/services/session.service';
import { UpdatePatientPreferencesDto, UpdatePatientProfileDto } from './dtos/patient-app.dto';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SessionReportService } from 'src/app/sesion/services/session-report.service';

type Contact = { id: string; name: string; relationship: string; phone: string; receivesReport: boolean };

@Injectable()
export class PatientAppService {
  constructor(
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(FamilyMember) private readonly families: Repository<FamilyMember>,
    private readonly users: UserBaseService,
    private readonly sessionsService: SessionService,
    private readonly reports: SessionReportService,
  ) {}

  private async patient(userId: string, allowTemporaryPassword = false) {
    const patient = await this.sessionsService.findPatientByUserId(userId);
    if (!allowTemporaryPassword && patient.user.mustChangePassword) {
      throw new ForbiddenException('You must change your temporary password first');
    }
    return this.patients.findOneOrFail({
      where: { id: patient.id },
      relations: ['user', 'familyMembers', 'familyMembers.user'],
    });
  }

  async changePassword(userId: string, password: string) {
    await this.users.changePassword(userId, password);
    return { changed: true };
  }

  async me(userId: string) {
    const patient = await this.patient(userId);
    return this.publicPatient(patient);
  }

  async updateProfile(userId: string, dto: UpdatePatientProfileDto) {
    const patient = await this.patient(userId);
    await this.users.updateUser(patient.user.id, { email: dto.email, address: dto.address });
    if (dto.phone !== undefined) patient.referencePhone = dto.phone;
    await this.patients.save(patient);
    return this.me(userId);
  }

  async updateContacts(userId: string, contacts: Contact[]) {
    if (contacts.length > 3) throw new BadRequestException('Maximum of three contacts');
    if (contacts.some((contact) => !contact.name || !contact.phone)) {
      throw new BadRequestException('Every contact needs a name and phone');
    }
    const patient = await this.patient(userId);
    patient.contacts = contacts.map((contact, index) => ({ ...contact, id: contact.id || `contact-${index + 1}` }));
    await this.patients.save(patient);
    return this.publicPatient(patient);
  }

  async updatePreferences(userId: string, dto: UpdatePatientPreferencesDto) {
    const patient = await this.patient(userId);
    patient.preferences = { ...patient.preferences, ...dto };
    await this.patients.save(patient);
    return this.publicPatient(patient);
  }

  async createFamilyInvite(userId: string) {
    const patient = await this.patient(userId);
    patient.familyInviteCode = `HS-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.floor(10 + Math.random() * 90)}`;
    patient.familyInviteExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.patients.save(patient);
    return { code: patient.familyInviteCode, expiresAt: patient.familyInviteExpiresAt };
  }

  async removeFamilyMember(userId: string, familyId: string) {
    const patient = await this.patient(userId);
    const family = await this.families.findOne({ where: { id: familyId }, relations: ['patients'] });
    if (!family) throw new NotFoundException('Family member not found');
    family.patients = family.patients.filter((linkedPatient) => linkedPatient.id !== patient.id);
    await this.families.save(family);
    return this.me(userId);
  }

  async status(userId: string) { await this.patient(userId); return this.sessionsService.getPatientOwnStatus(userId); }
  async sessions(userId: string) { await this.patient(userId); return this.sessionsService.getPatientOwnSessions(userId); }

  async evolution(userId: string, period: 'week' | 'month') {
    await this.patient(userId);
    const sessions = await this.sessionsService.getPatientOwnSessions(userId);
    const groups = new Map<string, typeof sessions>();
    for (const session of sessions) {
      const date = new Date(session.startedAt);
      const key = period === 'month'
        ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        : `${date.getFullYear()}-W${Math.ceil((((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 1)) / 86400000) + new Date(Date.UTC(date.getFullYear(), 0, 1)).getUTCDay() + 1) / 7)}`;
      groups.set(key, [...(groups.get(key) ?? []), session]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, records]) => {
      const avg = (values: Array<number | undefined>) => {
        const valid = values.filter((value): value is number => typeof value === 'number');
        return valid.length ? Number((valid.reduce((sum, value) => sum + value, 0) / valid.length).toFixed(2)) : null;
      };
      const sessionRecords = records.flatMap((record) => record.records ?? []);
      return {
        label,
        sessions: records.length,
        weightBefore: avg(records.map((record) => record.weightBefore)),
        weightAfter: avg(records.map((record) => record.weightAfter)),
        fluidRemoved: avg(records.map((record) => record.ultrafiltrationActualLiters ?? record.ultrafiltrationGoalLiters)),
        systolic: avg(sessionRecords.map((record) => record.systolic)),
        pulse: avg(sessionRecords.map((record) => record.pulse)),
      };
    });
  }

  async report(userId: string, sessionId: string) {
    await this.patient(userId);
    const report = await this.reports.generateSessionReport(sessionId);
    if (report.session.patient.user.id !== userId) throw new ForbiddenException('Not allowed to access this report');
    return report;
  }

  private publicPatient(patient: Patient) {
    return {
      id: patient.id,
      fullname: patient.user.fullname,
      email: patient.user.email,
      address: patient.user.address,
      phone: patient.referencePhone,
      age: patient.age,
      sex: patient.sex,
      patientType: patient.patientType,
      schedule: {
        days: patient.dialysisDays ?? [],
        startTime: patient.dialysisStartTime ?? null,
        durationMinutes: patient.sessionDurationMinutes ?? 240,
        nextSession: this.nextSession(patient.dialysisDays, patient.dialysisStartTime),
      },
      baseDisease: patient.baseDisease,
      knownAllergies: patient.knownAllergies,
      contacts: patient.contacts ?? [],
      preferences: patient.preferences ?? { fontSize: 'md' },
      familyMembers: patient.familyMembers?.map((member) => ({ id: member.id, fullname: member.user.fullname })) ?? [],
    };
  }

  private nextSession(days?: number[], time?: string): string | null {
    if (!days?.length || !time) return null;
    const [hours, minutes] = time.split(':').map(Number);
    const current = new Date();
    for (let offset = 0; offset < 8; offset += 1) {
      const candidate = new Date(current);
      candidate.setDate(current.getDate() + offset);
      candidate.setHours(hours, minutes, 0, 0);
      if (days.includes(candidate.getDay()) && candidate.getTime() > current.getTime()) {
        return candidate.toISOString();
      }
    }
    return null;
  }
}
