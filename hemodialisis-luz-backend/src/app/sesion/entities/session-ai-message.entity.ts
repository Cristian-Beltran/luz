import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Session } from './session.entity';

@Entity('session_ai_messages')
export class SessionAiMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Session, (session) => session.aiMessages, {
    onDelete: 'CASCADE',
  })
  session: Session;

  @Column({ type: 'text' })
  message: string;

  @Column({ default: 'openai' })
  source: string;

  @CreateDateColumn()
  createdAt: Date;
}
