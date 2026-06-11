// src/services/session/session.service.ts
import axios from "@/lib/axios";
import type {
  Session,
  CreateSessionDto,
  CreateSessionDataDto,
  SessionData,
} from "../session.interface";

const BASE_URL = "/sessions";

export const sessionService = {
  create: async (data: CreateSessionDto): Promise<Session> => {
    const res = await axios.post(BASE_URL, data);
    return res.data;
  },
  addData: async (
    sessionId: string,
    data: CreateSessionDataDto,
  ): Promise<SessionData> => {
    const res = await axios.post(`${BASE_URL}/${sessionId}/data`, data);
    return res.data;
  },
  close: async (sessionId: string): Promise<Session> => {
    const res = await axios.patch(`${BASE_URL}/${sessionId}/close`);
    return res.data;
  },
  findAll: async (): Promise<Session[]> => {
    const res = await axios.get(BASE_URL);
    return res.data;
  },

  /** 🔎 Todas las sesiones de un paciente con sus registros */
  findByPatient: async (patientId: string): Promise<Session[]> => {
    const res = await axios.get(`${BASE_URL}/by-patient/${patientId}`);
    return res.data;
  },
  downloadReport: async (
    sessionId: string,
  ): Promise<{ blob: Blob; fileName: string | null }> => {
    const res = await axios.get(`${BASE_URL}/${sessionId}/report`, {
      responseType: "blob",
    });
    const disposition = String(res.headers["content-disposition"] ?? "");
    const match = disposition.match(/filename="?([^\"]+)"?/i);
    return {
      blob: res.data,
      fileName: match?.[1] ?? null,
    };
  },
  sendReport: async (sessionId: string): Promise<{ ok: boolean }> => {
    const res = await axios.post(`/whatsapp/sessions/${sessionId}/report`);
    return res.data;
  },
};
