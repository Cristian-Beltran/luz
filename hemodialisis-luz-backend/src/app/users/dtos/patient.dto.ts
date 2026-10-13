// src/app/user/dto/create-patient.dto.ts
import {
  IsBoolean,
  IsArray,
  ArrayMinSize,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { CreateUserBaseDto } from './user.dto';

export class CreatePatientDto extends CreateUserBaseDto {
  @IsString()
  referenceName: string;

  @IsInt()
  @Min(0)
  @Max(120)
  age: number;

  @IsString()
  @IsIn(['masculino', 'femenino', 'otro'])
  sex: string;

  @IsString()
  @IsIn(['nino', 'adulto', 'adulto_mayor'])
  patientType: string;

  @IsString()
  referencePhone: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  dialysisDays?: number[];

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  dialysisStartTime?: string;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(600)
  sessionDurationMinutes?: number;

  @IsOptional()
  @IsString()
  baseDisease?: string;

  @IsOptional()
  @IsString()
  knownAllergies?: string;

  @IsBoolean()
  hasDiabetes: boolean;

  @IsBoolean()
  hasHypertension: boolean;

  @IsBoolean()
  hasHeartDisease: boolean;

  @IsBoolean()
  hasAnemia: boolean;

  @IsBoolean()
  hasPreviousInfections: boolean;
}
