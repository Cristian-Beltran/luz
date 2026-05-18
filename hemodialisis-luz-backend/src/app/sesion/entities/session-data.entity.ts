// src/app/session/entities/session-data.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { Session } from './session.entity';

@Entity('session_data')
export class SessionData {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Session, (session) => session.records, {
    onDelete: 'CASCADE',
  })
  session: Session;

  @Column('int')
  pulse: number; // bpm

  @Column('int')
  oxygenSaturation: number; // % SpO2

  @Column('float')
  temperatureC: number; // °C

  @Column('int')
  systolic: number; // mmHg

  @Column('int')
  diastolic: number; // mmHg

  @Column('float', { nullable: true })
  ambientTemperatureC?: number;

  @Column({ default: false })
  fingerDetected: boolean;

  @Column({ default: false })
  monitoringEnabled: boolean;

  @Column({ default: false })
  calibrationComplete: boolean;

  @Column({ default: false })
  respirationDetected: boolean;

  @Column({ default: false })
  respirationMissing: boolean;

  @Column({ default: false })
  warningActive: boolean;

  @Column({ default: false })
  alertActive: boolean;

  @CreateDateColumn()
  recordedAt: Date;
}
