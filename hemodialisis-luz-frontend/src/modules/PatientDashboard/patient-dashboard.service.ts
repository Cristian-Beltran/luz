import axios from "@/lib/axios";
import type { Session } from "@/modules/Session/session.interface";

export type PatientOwnStatus = {
  inTreatment: boolean;
  activeSession: Session | null;
  latestSession: Session | null;
  latestRecord: {
    pulse: number;
    oxygenSaturation: number;
    temperatureC: number;
    systolic: number;
    diastolic: number;
    warningActive?: boolean;
    alertActive?: boolean;
    recordedAt: string;
  } | null;
};

export const patientDashboardService = {
  getStatus: async (): Promise<PatientOwnStatus> => {
    const res = await axios.get("/sessions/me/status");
    return res.data;
  },
  getSessions: async (): Promise<Session[]> => {
    const res = await axios.get("/sessions/me");
    return res.data;
  },
};
