import { Body, Controller, Delete, Get, Param, Patch, Post, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { AuthService } from 'src/context/auth/auth.service';
import { LoginDto } from 'src/context/auth/dtos/login.dto';
import { JwtAuthGuard } from 'src/context/shared/guards/jwt-auth.guard';
import { UserTypeGuard } from 'src/context/shared/guards/type-user.guard';
import { UserTypes } from 'src/context/shared/decorators/type-user.decorator';
import { UserPayload } from 'src/context/shared/decorators/user.decorator';
import { PayloadToken } from 'src/context/shared/models/token.model';
import { UserType } from 'src/app/users/enums/user-type';
import { PatientAppService } from './patient-app.service';
import { ChangePatientPasswordDto, UpdatePatientContactsDto, UpdatePatientPreferencesDto, UpdatePatientProfileDto } from './dtos/patient-app.dto';
import { ParseUUIDPipe } from '@nestjs/common';
import { Response } from 'express';

@Controller('patient-app')
export class PatientAppController {
  constructor(private readonly authService: AuthService, private readonly patientApp: PatientAppService) {}

  @Post('auth/login')
  login(@Body() dto: LoginDto) { return this.authService.loginPatient(dto); }

  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes(UserType.PATIENT)
  @Post('auth/change-password')
  changePassword(@UserPayload() user: PayloadToken, @Body() dto: ChangePatientPasswordDto) {
    return this.patientApp.changePassword(user.sub, dto.password);
  }

  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes(UserType.PATIENT)
  @Get('me')
  me(@UserPayload() user: PayloadToken) { return this.patientApp.me(user.sub); }

  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes(UserType.PATIENT)
  @Patch('me')
  updateMe(@UserPayload() user: PayloadToken, @Body() dto: UpdatePatientProfileDto) { return this.patientApp.updateProfile(user.sub, dto); }

  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes(UserType.PATIENT)
  @Patch('me/contacts')
  contacts(@UserPayload() user: PayloadToken, @Body() dto: UpdatePatientContactsDto) { return this.patientApp.updateContacts(user.sub, dto.contacts); }

  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes(UserType.PATIENT)
  @Patch('me/preferences')
  preferences(@UserPayload() user: PayloadToken, @Body() dto: UpdatePatientPreferencesDto) { return this.patientApp.updatePreferences(user.sub, dto); }

  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes(UserType.PATIENT)
  @Post('me/family-invite')
  familyInvite(@UserPayload() user: PayloadToken) { return this.patientApp.createFamilyInvite(user.sub); }

  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes(UserType.PATIENT)
  @Delete('me/family/:id')
  removeFamily(@UserPayload() user: PayloadToken, @Param('id', new ParseUUIDPipe()) id: string) { return this.patientApp.removeFamilyMember(user.sub, id); }

  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes(UserType.PATIENT)
  @Get('sessions/status')
  status(@UserPayload() user: PayloadToken) { return this.patientApp.status(user.sub); }

  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes(UserType.PATIENT)
  @Get('sessions')
  sessions(@UserPayload() user: PayloadToken) { return this.patientApp.sessions(user.sub); }

  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes(UserType.PATIENT)
  @Get('sessions/evolution/:period')
  evolution(@UserPayload() user: PayloadToken, @Param('period') period: 'week' | 'month') {
    return this.patientApp.evolution(user.sub, period === 'month' ? 'month' : 'week');
  }

  @UseGuards(JwtAuthGuard, UserTypeGuard)
  @UserTypes(UserType.PATIENT)
  @Get('sessions/:id/report')
  async report(@UserPayload() user: PayloadToken, @Param('id', new ParseUUIDPipe()) id: string, @Res({ passthrough: true }) res: Response) {
    const report = await this.patientApp.report(user.sub, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${report.fileName}"`);
    return new StreamableFile(report.buffer);
  }
}
