// src/app/user/dto/create-patient.dto.ts
import { IsOptional, IsUUID } from 'class-validator';
import { CreateUserBaseDto } from './user.dto';
import { ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePatientDto extends CreateUserBaseDto {}
