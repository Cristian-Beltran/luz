import axios from "@/lib/axios";
import type { Session } from "@/modules/Session/session.interface";

export type MonitoringStatus = {
  activeSession: Session | null;
  deviceId: string;
  espOnline: boolean;
  lastSeenAt: string | null;
  lastTelemetry: Record<string, unknown> | null;
  persistIntervalSeconds: number;
};

export const monitoringService = {
  status: async (): Promise<MonitoringStatus> => {
    const res = await axios.get("/monitoring/status");
    return res.data;
  },
  start: async (patientId: string): Promise<Session> => {
    const res = await axios.post("/monitoring/start", { patientId });
    return res.data;
  },
  stop: async (): Promise<Session | { message: string }> => {
    const res = await axios.patch("/monitoring/stop");
    return res.data;
  },
};
