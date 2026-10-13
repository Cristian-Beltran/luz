import { IsString, Matches } from 'class-validator';

export class RedeemFamilyCodeDto {
  @IsString()
  @Matches(/^HS-[A-Z0-9]{4}-\d{2}$/)
  code: string;
}
