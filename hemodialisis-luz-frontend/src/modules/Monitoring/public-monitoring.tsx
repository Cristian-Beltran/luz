import { useEffect, useMemo, useState, type ReactNode } from "react";
import mqtt, { type MqttClient } from "mqtt";
import {
  Activity,
  Droplets,
  HeartPulse,
  Radio,
  Thermometer,
  UserRound,
  Waves,
  Wifi,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ClinicalStatusBadge } from "@/components/clinical/clinical-ui";
import {
  diastolicState,
  pulseState,
  spo2State,
  systolicState,
  tempState,
  type ClinicalState,
} from "@/components/clinical/clinical-ranges";

const MQTT_WS_URL = "wss://broker.hivemq.com:8884/mqtt";
const DEVICE_ID = "esp32-luz-01";
const TELEMETRY_TOPIC = `luz/device/${DEVICE_ID}/telemetry`;
const SESSION_TOPIC = `luz/device/${DEVICE_ID}/session`;
const DEVICE_TIMEOUT_MS = 12_000;

type LivePoint = {
  ts: string;
  deviceId: string;
  pulse?: number;
  spo2?: number;
  temperatureC?: number;
  ambientTemperatureC?: number;
  systolic?: number;
  diastolic?: number;
  fingerDetected: boolean;
  monitoringEnabled: boolean;
  calibrationComplete: boolean;
  respirationDetected: boolean;
  respirationMissing: boolean;
  warningActive: boolean;
  alertActive: boolean;
};

type SessionState = {
  deviceId: string;
  active: boolean;
  sessionId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  patient: { id: string; fullname: string } | null;
  publishedAt: string;
};

function toNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function toPoint(payload: Record<string, unknown>): LivePoint {
  return {
    ts: new Date().toISOString(),
    deviceId: String(payload.deviceId ?? DEVICE_ID),
    pulse: toNumber(payload.heartRateBpm),
    spo2: toNumber(payload.spo2),
    temperatureC: toNumber(payload.temperatureC),
    ambientTemperatureC: toNumber(payload.ambientTemperatureC),
    systolic: toNumber(payload.estimatedSystolicMmHg),
    diastolic: toNumber(payload.estimatedDiastolicMmHg),
    fingerDetected: Boolean(payload.fingerDetected),
    monitoringEnabled: Boolean(payload.monitoringEnabled),
    calibrationComplete: Boolean(payload.calibrationComplete),
    respirationDetected: Boolean(payload.respirationDetected),
    respirationMissing: Boolean(payload.respirationMissing),
    warningActive: Boolean(payload.warningActive),
    alertActive: Boolean(payload.alertActive),
  };
}

function toSessionState(payload: Record<string, unknown>): SessionState {
  const patient = payload.patient as { id?: unknown; fullname?: unknown } | null;
  return {
    deviceId: String(payload.deviceId ?? DEVICE_ID),
    active: Boolean(payload.active),
    sessionId: typeof payload.sessionId === "string" ? payload.sessionId : null,
    startedAt: typeof payload.startedAt === "string" ? payload.startedAt : null,
    endedAt: typeof payload.endedAt === "string" ? payload.endedAt : null,
    patient: patient
      ? {
          id: String(patient.id ?? ""),
          fullname: String(patient.fullname ?? "Paciente"),
        }
      : null,
    publishedAt:
      typeof payload.publishedAt === "string"
        ? payload.publishedAt
        : new Date().toISOString(),
  };
}

function formatTime(value?: string | null) {
  if (!value) return "Sin dato";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Sin dato";
  return date.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function statusFromFlags(last?: LivePoint): ClinicalState {
  if (!last) return "na";
  if (last.alertActive) return "alert";
  if (last.warningActive) return "warn";
  return "ok";
}

export default function PublicMonitoringPage() {
  const [mqttOnline, setMqttOnline] = useState(false);
  const [points, setPoints] = useState<LivePoint[]>([]);
  const [session, setSession] = useState<SessionState | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const client: MqttClient = mqtt.connect(MQTT_WS_URL, {
      clientId: `public-monitor-${Math.random().toString(16).slice(2, 8)}`,
      reconnectPeriod: 2000,
      connectTimeout: 10_000,
    });

    client.on("connect", () => {
      setMqttOnline(true);
      client.subscribe([TELEMETRY_TOPIC, SESSION_TOPIC]);
    });

    client.on("offline", () => setMqttOnline(false));
    client.on("close", () => setMqttOnline(false));
    client.on("error", () => setMqttOnline(false));

    client.on("message", (topic, message) => {
      try {
        const payload = JSON.parse(message.toString()) as Record<string, unknown>;
        if (topic === TELEMETRY_TOPIC) {
          setPoints((prev) => [...prev, toPoint(payload)].slice(-160));
        }
        if (topic === SESSION_TOPIC) {
          setSession(toSessionState(payload));
        }
      } catch {
        return;
      }
    });

    return () => {
      client.end(true);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const last = points.at(-1);
  const lastSeenTime = last ? new Date(last.ts).getTime() : 0;
  const deviceOnline = lastSeenTime > 0 && now - lastSeenTime <= DEVICE_TIMEOUT_MS;
  const clinicalState = statusFromFlags(last);
  const respirationOk = Boolean(last?.respirationDetected) && !last?.respirationMissing;

  const chartData = useMemo(
    () =>
      points.slice(-80).map((point) => ({
        t: new Date(point.ts).toLocaleTimeString("es-ES", {
          minute: "2-digit",
          second: "2-digit",
        }),
        pulse: point.pulse ?? null,
        spo2: point.spo2 ?? null,
        temp: point.temperatureC ?? null,
        ambient: point.ambientTemperatureC ?? null,
      })),
    [points],
  );

  return (
    <main className="h-dvh overflow-hidden bg-slate-950 text-slate-100">
      <div className="flex h-full flex-col gap-2 p-2 sm:p-3">
        <header className="grid shrink-0 gap-2 lg:grid-cols-[minmax(0,1fr)_520px]">
          <Card className="border-white/10 bg-white/[0.06] text-slate-100 shadow-xl">
            <CardContent className="flex items-center gap-3 p-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-cyan-400/15 text-cyan-200">
                <UserRound className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-base font-semibold leading-tight sm:text-lg">
                    {session?.patient?.fullname ?? "Sin paciente activo"}
                  </p>
                  <Badge variant={session?.active ? "default" : "secondary"}>
                    {session?.active ? "Sesion activa" : "Sin sesion"}
                  </Badge>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300">
                  <span>Inicio {formatTime(session?.startedAt)}</span>
                  <span>ID {session?.sessionId ? session.sessionId.slice(0, 8) : "sin dato"}</span>
                  <span>Ultima {formatTime(last?.ts)}</span>
                </div>
              </div>
              <div className="hidden text-right text-xs text-slate-400 md:block">
                <div>Monitor MQTT</div>
                <div>{DEVICE_ID}</div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-4 gap-2">
            <StatusBox label="MQTT" active={mqttOnline} ok="Conectado" bad="Offline" icon={<Radio />} />
            <StatusBox label="ESP" active={deviceOnline} ok="Online" bad="Sin senal" icon={<Wifi />} />
            <StatusBox label="Resp." active={respirationOk} ok="Detectada" bad="No detectada" icon={<Waves />} />
            <StatusBox label="Clinico" active={clinicalState === "ok"} ok="Normal" bad={clinicalState === "alert" ? "Alerta" : "Vigilar"} />
          </div>
        </header>

        <section className="grid min-h-0 flex-1 gap-2 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-2">
            <Card className="border-white/10 bg-white/[0.06] text-slate-100 shadow-xl">
              <CardContent className="grid grid-cols-2 gap-2 p-3 text-xs">
                <MiniInfo label="Dedo" value={last?.fingerDetected ? "Si" : "No"} active={Boolean(last?.fingerDetected)} />
                <MiniInfo label="Monitoreo" value={last?.monitoringEnabled ? "Activo" : "Espera"} active={Boolean(last?.monitoringEnabled)} />
                <MiniInfo label="Calibracion" value={last?.calibrationComplete ? "Lista" : "Pendiente"} active={Boolean(last?.calibrationComplete)} />
                <MiniInfo label="Paquetes" value={points.length} active={points.length > 0} />
              </CardContent>
            </Card>

            <MetricCard
              label="Respiracion"
              icon={<Waves className="h-4 w-4" />}
              value={respirationOk ? 1 : 0}
              displayValue={respirationOk ? "OK" : "NO"}
              unit=""
              state={respirationOk ? "ok" : last?.respirationMissing ? "alert" : "na"}
              progress={respirationOk ? 100 : 0}
            />

            <Card className="min-h-0 border-white/10 bg-white/[0.06] text-slate-100 shadow-xl">
              <CardContent className="flex h-full flex-col justify-center gap-2 p-3 text-xs text-slate-300">
                <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <span>Estado ESP</span>
                  <Badge variant={deviceOnline ? "default" : "secondary"}>
                    {deviceOnline ? "Online" : "Sin senal"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <span>MQTT</span>
                  <Badge variant={mqttOnline ? "default" : "secondary"}>
                    {mqttOnline ? "Conectado" : "Offline"}
                  </Badge>
                </div>
                <div className="truncate rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  Device {last?.deviceId ?? DEVICE_ID}
                </div>
              </CardContent>
            </Card>
          </aside>

          <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2">
            <div className="grid grid-cols-5 gap-2">
              <MetricCard
                label="Pulso"
                icon={<HeartPulse className="h-4 w-4" />}
                value={last?.pulse}
                unit="bpm"
                state={pulseState(last?.pulse)}
                progress={scale(last?.pulse, 40, 160)}
              />
              <MetricCard
                label="SpO2"
                icon={<Droplets className="h-4 w-4" />}
                value={last?.spo2}
                unit="%"
                state={spo2State(last?.spo2)}
                progress={scale(last?.spo2, 85, 100)}
              />
              <MetricCard
                label="Temp"
                icon={<Thermometer className="h-4 w-4" />}
                value={last?.temperatureC}
                unit="C"
                state={tempState(last?.temperatureC)}
                progress={scale(last?.temperatureC, 35, 40)}
              />
              <MetricCard
                label="Sistolica"
                icon={<Activity className="h-4 w-4" />}
                value={last?.systolic}
                unit="mmHg"
                state={systolicState(last?.systolic)}
                progress={scale(last?.systolic, 80, 180)}
              />
              <MetricCard
                label="Diastolica"
                icon={<Activity className="h-4 w-4" />}
                value={last?.diastolic}
                unit="mmHg"
                state={diastolicState(last?.diastolic)}
                progress={scale(last?.diastolic, 50, 120)}
              />
            </div>

            <div className="grid min-h-0 grid-cols-2 gap-2">
              <ChartCard
                title="Pulso / SpO2"
                data={chartData}
                lines={[
                  { key: "pulse", name: "Pulso", color: "#38bdf8" },
                  { key: "spo2", name: "SpO2", color: "#34d399" },
                ]}
              />
              <ChartCard
                title="Temperatura"
                data={chartData}
                lines={[
                  { key: "temp", name: "Corporal", color: "#fb923c" },
                  { key: "ambient", name: "Ambiente", color: "#a78bfa" },
                ]}
              />
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

function scale(value: number | undefined, min: number, max: number) {
  if (!Number.isFinite(value) || max <= min) return 0;
  return Math.max(0, Math.min(100, (((value as number) - min) / (max - min)) * 100));
}

function StatusBox({
  label,
  active,
  ok,
  bad,
  icon,
}: {
  label: string;
  active: boolean;
  ok: string;
  bad: string;
  icon?: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-white/[0.06] px-2 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase text-slate-400">
        {icon && <span className="[&_svg]:h-3 [&_svg]:w-3">{icon}</span>}
        <span className="truncate">{label}</span>
      </div>
      <div className={active ? "truncate text-xs font-semibold text-emerald-300" : "truncate text-xs font-semibold text-amber-300"}>
        {active ? ok : bad}
      </div>
    </div>
  );
}

function MiniInfo({
  label,
  value,
  active,
}: {
  label: string;
  value: string | number;
  active: boolean;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5">
      <div className="text-[10px] uppercase text-slate-400">{label}</div>
      <div className={active ? "truncate font-semibold text-emerald-300" : "truncate font-semibold text-slate-300"}>
        {value}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  icon,
  value,
  displayValue,
  unit,
  state,
  progress,
}: {
  label: string;
  icon: ReactNode;
  value?: number;
  displayValue?: string;
  unit: string;
  state: ClinicalState;
  progress: number;
}) {
  return (
    <Card className="min-w-0 border-white/10 bg-white/[0.06] text-slate-100 shadow-xl">
      <CardContent className="p-2.5">
        <div className="flex items-center justify-between gap-1">
          <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-[10px] uppercase text-slate-300">
            {icon}
            {label}
          </span>
          <ClinicalStatusBadge state={state} />
        </div>
        <div className="mt-1 flex items-end gap-1">
          <span className="truncate text-2xl font-semibold leading-none">
            {displayValue ?? (typeof value === "number" ? value.toFixed(1) : "-")}
          </span>
          {unit && <span className="text-[11px] text-slate-400">{unit}</span>}
        </div>
        <Progress value={progress} className="mt-2 h-1" />
      </CardContent>
    </Card>
  );
}

function ChartCard({
  title,
  data,
  lines,
}: {
  title: string;
  data: Array<Record<string, string | number | null>>;
  lines: Array<{ key: string; name: string; color: string }>;
}) {
  return (
    <Card className="flex min-h-0 flex-col border-white/10 bg-white/[0.06] text-slate-100 shadow-xl">
      <CardHeader className="shrink-0 px-3 py-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 px-2 pb-2 pt-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
            <XAxis dataKey="t" stroke="#94a3b8" tick={{ fontSize: 10 }} />
            <YAxis stroke="#94a3b8" tick={{ fontSize: 10 }} width={34} />
            <Tooltip
              contentStyle={{
                background: "#020617",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 8,
                color: "#e2e8f0",
              }}
            />
            {lines.map((line) => (
              <Line
                key={line.key}
                type="monotone"
                dataKey={line.key}
                name={line.name}
                stroke={line.color}
                dot={false}
                strokeWidth={2}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
