import { IsUUID } from 'class-validator';

export class StartMonitoringDto {
  @IsUUID('4')
  patientId: string;
}
