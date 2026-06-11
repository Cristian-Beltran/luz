import { IsIn, IsString } from 'class-validator';

export class DevicePowerDto {
  @IsString()
  @IsIn(['on', 'off'])
  state: 'on' | 'off';
}
