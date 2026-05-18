export type ClinicalState = "ok" | "warn" | "alert" | "na";

export function pulseState(value?: number): ClinicalState {
  if (!Number.isFinite(value)) return "na";
  if ((value as number) < 50 || (value as number) > 120) return "alert";
  if ((value as number) < 60 || (value as number) > 100) return "warn";
  return "ok";
}

export function spo2State(value?: number): ClinicalState {
  if (!Number.isFinite(value)) return "na";
  if ((value as number) < 90) return "alert";
  if ((value as number) < 95) return "warn";
  return "ok";
}

export function tempState(value?: number): ClinicalState {
  if (!Number.isFinite(value)) return "na";
  if ((value as number) >= 38.5 || (value as number) < 35.5) return "alert";
  if ((value as number) >= 37.5 || (value as number) < 36.0) return "warn";
  return "ok";
}

export function systolicState(value?: number): ClinicalState {
  if (!Number.isFinite(value)) return "na";
  if ((value as number) >= 160 || (value as number) < 90) return "alert";
  if ((value as number) > 130 || (value as number) < 100) return "warn";
  return "ok";
}

export function diastolicState(value?: number): ClinicalState {
  if (!Number.isFinite(value)) return "na";
  if ((value as number) >= 100 || (value as number) < 50) return "alert";
  if ((value as number) > 85 || (value as number) < 60) return "warn";
  return "ok";
}

export function stateLabel(state: ClinicalState): string {
  if (state === "ok") return "Normal";
  if (state === "warn") return "Vigilar";
  if (state === "alert") return "Alerta";
  return "Sin dato";
}

export function stateClass(state: ClinicalState): string {
  if (state === "ok") return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (state === "warn") return "text-amber-700 bg-amber-50 border-amber-200";
  if (state === "alert") return "text-red-700 bg-red-50 border-red-200";
  return "text-slate-600 bg-slate-50 border-slate-200";
}
