// src/app/session/entities/session.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
} from 'typeorm';
import { Patient } from '../../users/entities/patient.entity';
import { SessionData } from './session-data.entity';
import { SessionAiMessage } from './session-ai-message.entity';
import { SessionEvent } from './session-event.entity';

@Entity('sessions')
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Patient, { eager: true })
  patient: Patient;

  @CreateDateColumn()
  startedAt: Date;

  @Column()
  deviceId: string;

  @Column({ type: 'datetime', nullable: true })
  endedAt?: Date;

  @Column('float', { nullable: true })
  weightBefore?: number;

  @Column('float', { nullable: true })
  weightAfter?: number;

  @Column('float', { nullable: true })
  dryWeight?: number;

  @Column('float', { nullable: true })
  ultrafiltrationGoalLiters?: number;

  @Column('float', { nullable: true })
  ultrafiltrationActualLiters?: number;

  @Column('int', { default: 30 })
  pressureIntervalMinutes: number;

  @Column({ type: 'datetime', nullable: true })
  lastPressureAt?: Date;

  @Column('int', { nullable: true })
  sessionDurationMinutes?: number;

  @Column({ type: 'text', nullable: true })
  reportedSymptoms?: string;

  @Column({ default: false })
  dizziness: boolean;

  @Column({ default: false })
  nausea: boolean;

  @Column({ default: false })
  cramps: boolean;

  @Column({ default: false })
  pain: boolean;

  @Column({ default: false })
  shortnessOfBreath: boolean;

  @Column({ default: false })
  weakness: boolean;

  @Column({ default: false })
  chills: boolean;

  @Column({ type: 'text', nullable: true })
  staffObservations?: string;

  @OneToMany(() => SessionData, (data) => data.session, { cascade: true })
  records: SessionData[];

  @OneToMany(() => SessionAiMessage, (message) => message.session, {
    cascade: true,
  })
  aiMessages: SessionAiMessage[];

  @OneToMany(() => SessionEvent, (event) => event.session, { cascade: true })
  events: SessionEvent[];
}
