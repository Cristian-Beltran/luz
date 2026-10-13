// src/app/user/services/patient.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Patient } from '../entities/patient.entity';
import { CreatePatientDto } from '../dtos/patient.dto';
import { UserBaseService } from './users.service';
import { ConfigService } from '@nestjs/config';
import { UserType } from '../enums/user-type';
import { Status } from '../../../context/shared/models/active.model';

@Injectable()
export class PatientService {
  constructor(
    @InjectRepository(Patient)
    private readonly patientRepository: Repository<Patient>,
    private readonly userBaseService: UserBaseService,
    private readonly configService: ConfigService,
  ) {}

  async create(dto: CreatePatientDto): Promise<Patient> {
    dto.type = UserType.PATIENT;
    dto.status = Status.ACTIVE;

    const user = await this.userBaseService.createUser({
      fullname: dto.fullname,
      email: dto.email,
      password: this.configService.get<string>('config.patientDefaultPassword'),
      address: dto.address,
      type: UserType.PATIENT,
      status: Status.ACTIVE,
    }, { mustChangePassword: true });
    const patient = this.patientRepository.create({
      user,
      referenceName: dto.referenceName,
      age: dto.age,
      sex: dto.sex,
      patientType: dto.patientType,
      referencePhone: dto.referencePhone,
      dialysisDays: dto.dialysisDays,
      dialysisStartTime: dto.dialysisStartTime,
      sessionDurationMinutes: dto.sessionDurationMinutes ?? 240,
      baseDisease: dto.baseDisease,
      knownAllergies: dto.knownAllergies,
      hasDiabetes: dto.hasDiabetes,
      hasHypertension: dto.hasHypertension,
      hasHeartDisease: dto.hasHeartDisease,
      hasAnemia: dto.hasAnemia,
      hasPreviousInfections: dto.hasPreviousInfections,
    });
    return this.patientRepository.save(patient);
  }

  async resetPassword(id: string) {
    const patient = await this.findOne(id);
    await this.userBaseService.resetPassword(
      patient.user.id,
      this.configService.get<string>('config.patientDefaultPassword')!,
    );
    return { message: 'Password reset. The patient must change it at next login.' };
  }

  async findAll(): Promise<Patient[]> {
    return this.patientRepository
      .createQueryBuilder('patient')
      .innerJoinAndSelect('patient.user', 'user')
      .where('user.status != :deletedStatus', { deletedStatus: Status.DELETED })
      .getMany();
  }

  async findOne(id: string): Promise<Patient> {
    const patient = await this.patientRepository.findOne({
      where: { user: { id } },
      relations: ['user'],
    });
    if (!patient) throw new NotFoundException(`Patient ${id} not found`);
    return patient;
  }

  async update(id: string, dto: Partial<CreatePatientDto>): Promise<Patient> {
    const patient = await this.findOne(id);
    await this.userBaseService.updateUser(patient.user.id, {
      fullname: dto.fullname,
      email: dto.email,
      address: dto.address,
    });

    Object.assign(patient, {
      referenceName: dto.referenceName ?? patient.referenceName,
      age: dto.age ?? patient.age,
      sex: dto.sex ?? patient.sex,
      patientType: dto.patientType ?? patient.patientType,
      referencePhone: dto.referencePhone ?? patient.referencePhone,
      dialysisDays: dto.dialysisDays ?? patient.dialysisDays,
      dialysisStartTime: dto.dialysisStartTime ?? patient.dialysisStartTime,
      sessionDurationMinutes:
        dto.sessionDurationMinutes ?? patient.sessionDurationMinutes,
      baseDisease: dto.baseDisease ?? patient.baseDisease,
      knownAllergies: dto.knownAllergies ?? patient.knownAllergies,
      hasDiabetes: dto.hasDiabetes ?? patient.hasDiabetes,
      hasHypertension: dto.hasHypertension ?? patient.hasHypertension,
      hasHeartDisease: dto.hasHeartDisease ?? patient.hasHeartDisease,
      hasAnemia: dto.hasAnemia ?? patient.hasAnemia,
      hasPreviousInfections:
        dto.hasPreviousInfections ?? patient.hasPreviousInfections,
    });

    await this.patientRepository.save(patient);
    return await this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const patient = await this.findOne(id);
    await this.userBaseService.removeUser(patient.user.id);
  }

  async findOneOrThrow(id: string): Promise<Patient> {
    const patient = await this.patientRepository.findOne({
      where: { id },
    });
    if (!patient) throw new NotFoundException('Patient not found');
    return patient;
  }
  async updateStatus(id: string, status: Status): Promise<Patient> {
    await this.userBaseService.updateStatus(id, status);
    return await this.findOne(id);
  }
}
