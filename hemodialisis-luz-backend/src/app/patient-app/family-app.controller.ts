import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthService } from 'src/context/auth/auth.service';
import { LoginDto } from 'src/context/auth/dtos/login.dto';
import { JwtAuthGuard } from 'src/context/shared/guards/jwt-auth.guard';
import { UserTypeGuard } from 'src/context/shared/guards/type-user.guard';
import { UserTypes } from 'src/context/shared/decorators/type-user.decorator';
import { UserPayload } from 'src/context/shared/decorators/user.decorator';
import { PayloadToken } from 'src/context/shared/models/token.model';
import { UserType } from 'src/app/users/enums/user-type';
import { ParseUUIDPipe } from '@nestjs/common';
import { FamilyAppService } from './family-app.service';
import { RedeemFamilyCodeDto } from './dtos/family-app.dto';

@Controller('family-app')
export class FamilyAppController {
  constructor(private readonly auth: AuthService, private readonly familyApp: FamilyAppService) {}

  @Post('auth/login')
  login(@Body() dto: LoginDto) { return this.auth.loginFamily(dto); }

  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes(UserType.FAMILY)
  @Get('patients')
  patients(@UserPayload() user: PayloadToken) { return this.familyApp.patientsFor(user.sub); }

  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes(UserType.FAMILY)
  @Post('link-code')
  redeem(@UserPayload() user: PayloadToken, @Body() dto: RedeemFamilyCodeDto) { return this.familyApp.redeem(user.sub, dto.code); }

  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes(UserType.FAMILY)
  @Get('patients/:id/sessions')
  sessions(@UserPayload() user: PayloadToken, @Param('id', new ParseUUIDPipe()) id: string) { return this.familyApp.sessionsFor(user.sub, id); }
}
