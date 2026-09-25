import type { BreathingPhase } from "./breathing-phase";
import type { MonitoringSession } from "./monitoring-session";

export interface SensorReading {
  id: string;
  sessionId: string;
  timestamp: string;
  pulseBpm?: number;
  respiratoryRateBpm?: number;
  pressureVoltage?: number;
  breathingPhase?: BreathingPhase;
  createdAt: string;
  // Relaciones
  session?: MonitoringSession;
}
