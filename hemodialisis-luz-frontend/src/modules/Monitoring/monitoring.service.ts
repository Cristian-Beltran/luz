import axios from "@/lib/axios";
import type { Session } from "@/modules/Session/session.interface";

export type MonitoringStatus = {
  activeSession: Session | null;
  recentAiMessages: Array<{
    id: string;
    message: string;
    source: string;
    createdAt: string;
  }>;
  deviceId: string;
  espOnline: boolean;
  devicePowerOn: boolean;
  lastSeenAt: string | null;
  lastTelemetry: Record<string, unknown> | null;
  persistIntervalSeconds: number;
};

export const monitoringService = {
  status: async (): Promise<MonitoringStatus> => {
    const res = await axios.get("/monitoring/status");
    return res.data;
  },
  start: async (data: Partial<Session> & { patientId: string }): Promise<Session> => {
    const res = await axios.post("/monitoring/start", data);
    return res.data;
  },
  power: async (state: "on" | "off"): Promise<{ ok: boolean; state: "on" | "off" }> => {
    const res = await axios.patch("/monitoring/power", { state });
    return res.data;
  },
  command: async (
    command: "inflate" | "mute" | "pzero",
    source: "doctor" | "public",
  ): Promise<{ ok: boolean }> => {
    const res = await axios.post("/monitoring/command", { command, source });
    return res.data;
  },
  stop: async (weightAfter: number): Promise<Session | { message: string }> => {
    const res = await axios.patch("/monitoring/stop", { weightAfter });
    return res.data;
  },
};
