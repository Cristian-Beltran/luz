import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FamilyMember } from 'src/app/users/entities/family.entity';
import { Patient } from 'src/app/users/entities/patient.entity';
import { Repository } from 'typeorm';
import { SessionService } from 'src/app/sesion/services/session.service';

@Injectable()
export class FamilyAppService {
  constructor(
    @InjectRepository(FamilyMember) private readonly families: Repository<FamilyMember>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    private readonly sessions: SessionService,
  ) {}

  private async family(userId: string) {
    const family = await this.families.findOne({
      where: { user: { id: userId } },
      relations: ['user', 'patients', 'patients.user'],
    });
    if (!family) throw new NotFoundException('Family profile not found');
    return family;
  }

  async patientsFor(userId: string) {
    const family = await this.family(userId);
    return family.patients.map((patient) => ({ id: patient.id, fullname: patient.user.fullname, age: patient.age, patientType: patient.patientType }));
  }

  async redeem(userId: string, code: string) {
    const family = await this.family(userId);
    const patient = await this.patients.findOne({
      where: { familyInviteCode: code },
      relations: ['user', 'familyMembers', 'familyMembers.user'],
    });
    if (!patient || !patient.familyInviteExpiresAt || patient.familyInviteExpiresAt.getTime() < Date.now()) {
      throw new NotFoundException('Invalid or expired family code');
    }
    if (!family.patients.some((linkedPatient) => linkedPatient.id === patient.id)) {
      family.patients.push(patient);
      await this.families.save(family);
    }
    patient.familyInviteCode = null as unknown as string;
    patient.familyInviteExpiresAt = null as unknown as Date;
    await this.patients.save(patient);
    return { linked: true, patient: { id: patient.id, fullname: patient.user.fullname } };
  }

  async sessionsFor(userId: string, patientId: string) {
    const family = await this.family(userId);
    if (!family.patients.some((patient) => patient.id === patientId)) throw new ForbiddenException('Not linked to this patient');
    return this.sessions.findByPatient(patientId);
  }
}
