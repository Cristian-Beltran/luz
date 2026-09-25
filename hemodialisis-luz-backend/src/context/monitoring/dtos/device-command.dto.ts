import { IsIn, IsString } from 'class-validator';

export class DeviceCommandDto {
  @IsString()
  @IsIn(['inflate', 'mute', 'pzero'])
  command: 'inflate' | 'mute' | 'pzero';

  @IsString()
  @IsIn(['doctor', 'public'])
  source: 'doctor' | 'public';
}
