import type { Patient } from "../Patient/patient.interface";

// --- DTOs de entrada ---
export interface CreateSessionDto {
  patientId: string;
  deviceId: string;
}

export interface CreateSessionDataDto {
  pulse: number; // bpm
  oxygenSaturation: number; // %
  temperatureC: number; // °C
  systolic: number; // mmHg
  diastolic: number; // mmHg
  ambientTemperatureC?: number;
  fingerDetected?: boolean;
  monitoringEnabled?: boolean;
  calibrationComplete?: boolean;
  respirationDetected?: boolean;
  respirationMissing?: boolean;
  warningActive?: boolean;
  alertActive?: boolean;
}

// --- Modelos de lectura ---
export interface SessionData {
  id: string;
  pulse: number;
  oxygenSaturation: number;
  temperatureC: number;
  systolic: number;
  diastolic: number;
  ambientTemperatureC?: number;
  fingerDetected?: boolean;
  monitoringEnabled?: boolean;
  calibrationComplete?: boolean;
  respirationDetected?: boolean;
  respirationMissing?: boolean;
  warningActive?: boolean;
  alertActive?: boolean;
  recordedAt: string; // ISO
}

export interface Session {
  id: string;
  patient: Patient;
  startedAt: string; // ISO
  endedAt?: string | null; // ISO | null
  deviceId: string;
  records?: SessionData[];
}
