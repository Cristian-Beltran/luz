// src/app/session/dto/create-session-data.dto.ts
import { IsInt, IsNumber, Min, Max } from 'class-validator';

export class CreateSessionDataDto {
  @IsInt()
  @Min(20)
  @Max(250)
  pulse: number;

  @IsInt()
  @Min(0)
  @Max(100)
  oxygenSaturation: number;

  @IsNumber()
  @Min(30) // salvaguarda ante lecturas inválidas
  @Max(45) // típico rango clínico en °C
  temperatureC: number;

  @IsInt()
  @Min(50)
  @Max(260)
  systolic: number;

  @IsInt()
  @Min(30)
  @Max(200)
  diastolic: number;
}
