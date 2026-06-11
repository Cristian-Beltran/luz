// src/app/user/dto/create-patient.dto.ts
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
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
