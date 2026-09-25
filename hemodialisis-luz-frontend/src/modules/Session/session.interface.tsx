import type { Patient } from "../Patient/patient.interface";

// --- DTOs de entrada ---
export interface CreateSessionDto {
  patientId: string;
  deviceId?: string;
  weightBefore?: number;
  dryWeight?: number;
  pressureIntervalMinutes?: number;
  reportedSymptoms?: string;
  dizziness?: boolean;
  nausea?: boolean;
  cramps?: boolean;
  pain?: boolean;
  shortnessOfBreath?: boolean;
  weakness?: boolean;
  chills?: boolean;
  staffObservations?: string;
}

export interface CreateSessionDataDto {
  pulse: number; // bpm
  temperatureC: number; // °C
  systolic: number; // mmHg
  diastolic: number; // mmHg
  ambientTemperatureC?: number;
  fingerDetected?: boolean;
  monitoringEnabled?: boolean;
  calibrationComplete?: boolean;
  respirationDetected?: boolean;
  respirationMissing?: boolean;
  respiratoryRateBpm: number;
  warningActive?: boolean;
  alertActive?: boolean;
}

// --- Modelos de lectura ---
export interface SessionData {
  id: string;
  pulse: number;
  temperatureC: number;
  systolic: number;
  diastolic: number;
  ambientTemperatureC?: number;
  fingerDetected?: boolean;
  monitoringEnabled?: boolean;
  calibrationComplete?: boolean;
  respirationDetected?: boolean;
  respirationMissing?: boolean;
  respiratoryRateBpm: number;
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
  weightBefore?: number | null;
  weightAfter?: number | null;
  dryWeight?: number | null;
  ultrafiltrationGoalLiters?: number | null;
  ultrafiltrationActualLiters?: number | null;
  pressureIntervalMinutes: number;
  lastPressureAt?: string | null;
  sessionDurationMinutes?: number | null;
  reportedSymptoms?: string | null;
  dizziness?: boolean;
  nausea?: boolean;
  cramps?: boolean;
  pain?: boolean;
  shortnessOfBreath?: boolean;
  weakness?: boolean;
  chills?: boolean;
  staffObservations?: string | null;
  records?: SessionData[];
  aiMessages?: Array<{
    id: string;
    message: string;
    source: string;
    createdAt: string;
  }>;
  events?: Array<{
    id: string;
    type: string;
    source: string;
    description: string;
    metadata?: string | null;
    createdAt: string;
  }>;
}
