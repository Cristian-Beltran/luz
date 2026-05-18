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

  @OneToMany(() => SessionData, (data) => data.session, { cascade: true })
  records: SessionData[];
}
