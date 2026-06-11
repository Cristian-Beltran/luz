import type { User } from "@/types/user.interface";

export interface Patient {
  id: string;
  user: User;
  referenceName: string;
  age: number;
  sex: "masculino" | "femenino" | "otro";
  patientType: "nino" | "adulto" | "adulto_mayor";
  referencePhone: string;
  baseDisease?: string;
  knownAllergies?: string;
  hasDiabetes: boolean;
  hasHypertension: boolean;
  hasHeartDisease: boolean;
  hasAnemia: boolean;
  hasPreviousInfections: boolean;
}

export interface CreatePatient {
  fullname: string;
  email: string;
  password?: string;
  address?: string;
  referenceName: string;
  age: number;
  sex: "masculino" | "femenino" | "otro";
  patientType: "nino" | "adulto" | "adulto_mayor";
  referencePhone: string;
  baseDisease?: string;
  knownAllergies?: string;
  hasDiabetes: boolean;
  hasHypertension: boolean;
  hasHeartDisease: boolean;
  hasAnemia: boolean;
  hasPreviousInfections: boolean;
}
