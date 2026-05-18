import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CreateSessionDto {
  @IsUUID('4')
  patientId: string;

  @IsString()
  @IsNotEmpty()
  deviceId: string;
}
