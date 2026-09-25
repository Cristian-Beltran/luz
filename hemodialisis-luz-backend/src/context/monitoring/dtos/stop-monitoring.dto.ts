import { IsNumber, Max, Min } from 'class-validator';

export class StopMonitoringDto {
  @IsNumber()
  @Min(1)
  @Max(500)
  weightAfter: number;
}
