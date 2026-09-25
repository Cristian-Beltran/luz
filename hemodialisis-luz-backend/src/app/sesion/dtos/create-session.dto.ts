import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateSessionDto {
  @IsUUID('4')
  patientId: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  deviceId?: string;

  @IsOptional()
  @IsNumber()
  weightBefore?: number;

  @IsOptional()
  @IsNumber()
  dryWeight?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(240)
  pressureIntervalMinutes?: number;

  @IsOptional()
  @IsString()
  reportedSymptoms?: string;

  @IsOptional()
  @IsBoolean()
  dizziness?: boolean;

  @IsOptional()
  @IsBoolean()
  nausea?: boolean;

  @IsOptional()
  @IsBoolean()
  cramps?: boolean;

  @IsOptional()
  @IsBoolean()
  pain?: boolean;

  @IsOptional()
  @IsBoolean()
  shortnessOfBreath?: boolean;

  @IsOptional()
  @IsBoolean()
  weakness?: boolean;

  @IsOptional()
  @IsBoolean()
  chills?: boolean;

  @IsOptional()
  @IsString()
  staffObservations?: string;
}
