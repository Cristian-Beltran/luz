// src/app/user/entities/patient.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  OneToOne,
  JoinColumn,
  ManyToMany,
  Column,
} from 'typeorm';
import { User } from './user.entity';
import { FamilyMember } from './family.entity';

@Entity('patients')
export class Patient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, { eager: true })
  @JoinColumn()
  user: User;

  @Column()
  referenceName: string;

  @Column('int')
  age: number;

  @Column()
  sex: string;

  @Column()
  patientType: string;

  @Column()
  referencePhone: string;

  @Column({ type: 'simple-json', nullable: true })
  dialysisDays?: number[];

  @Column({ nullable: true })
  dialysisStartTime?: string;

  @Column('int', { default: 240 })
  sessionDurationMinutes: number;

  @Column({ type: 'simple-json', nullable: true })
  contacts?: Array<{
    id: string;
    name: string;
    relationship: string;
    phone: string;
    receivesReport: boolean;
  }>;

  @Column({ type: 'simple-json', nullable: true })
  preferences?: { fontSize?: 'sm' | 'md' | 'lg' };

  @Column({ nullable: true })
  familyInviteCode?: string;

  @Column({ type: 'datetime', nullable: true })
  familyInviteExpiresAt?: Date;

  @Column({ type: 'text', nullable: true })
  baseDisease?: string;

  @Column({ type: 'text', nullable: true })
  knownAllergies?: string;

  @Column({ default: false })
  hasDiabetes: boolean;

  @Column({ default: false })
  hasHypertension: boolean;

  @Column({ default: false })
  hasHeartDisease: boolean;

  @Column({ default: false })
  hasAnemia: boolean;

  @Column({ default: false })
  hasPreviousInfections: boolean;

  @ManyToMany(() => FamilyMember, (family) => family.patients)
  familyMembers: FamilyMember[];
}
