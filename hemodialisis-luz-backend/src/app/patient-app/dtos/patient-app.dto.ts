import { IsArray, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class ChangePatientPasswordDto {
  @IsString()
  @MinLength(8)
  password: string;
}

export class UpdatePatientProfileDto {
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
}

export class UpdatePatientContactsDto {
  @IsArray()
  contacts: Array<{
    id: string;
    name: string;
    relationship: string;
    phone: string;
    receivesReport: boolean;
  }>;
}

export class UpdatePatientPreferencesDto {
  @IsOptional()
  @IsIn(['sm', 'md', 'lg'])
  fontSize?: 'sm' | 'md' | 'lg';
}
