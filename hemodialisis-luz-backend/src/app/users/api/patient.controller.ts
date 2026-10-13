// src/app/user/controllers/patient.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  ParseUUIDPipe,
  Put,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { PatientService } from '../services/patient.service';
import { CreatePatientDto } from '../dtos/patient.dto';
import { JwtAuthGuard } from 'src/context/shared/guards/jwt-auth.guard';
import { Status } from 'src/context/shared/models/active.model';
import { UserTypeGuard } from 'src/context/shared/guards/type-user.guard';
import { UserTypes } from 'src/context/shared/decorators/type-user.decorator';
import { UserType } from '../enums/user-type';

@Controller('patients')
@UseGuards(JwtAuthGuard, UserTypeGuard)
@UserTypes(UserType.DOCTOR)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class PatientController {
  constructor(private readonly patientService: PatientService) {}

  @Post()
  create(@Body() dto: CreatePatientDto) {
    return this.patientService.create(dto);
  }

  @Post(':id/reset-password')
  resetPassword(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.patientService.resetPassword(id);
  }

  @Get()
  findAll() {
    return this.patientService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.patientService.findOne(id);
  }

  @Put(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: Partial<CreatePatientDto>,
  ) {
    return this.patientService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.patientService.remove(id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: { status: Status },
  ) {
    return this.patientService.updateStatus(id, dto.status);
  }
}
