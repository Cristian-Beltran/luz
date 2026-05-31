import { useEffect, useMemo, useState } from "react";
import mqtt, { type MqttClient } from "mqtt";
import { patientService } from "@/modules/Patient/data/patient.service";
import type { Patient } from "@/modules/Patient/patient.interface";
import { monitoringService, type MonitoringStatus } from "./monitoring.service";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceArea,
} from "recharts";
import { Activity, Droplets, HeartPulse, Thermometer } from "lucide-react";
import { ClinicalMetricCard } from "@/components/clinical/clinical-ui";
import {
  diastolicState,
  pulseState,
  spo2State,
  systolicState,
  tempState,
} from "@/components/clinical/clinical-ranges";

type LivePoint = {
  ts: string;
  pulse: number;
  spo2: number;
  temperatureC: number;
  systolic: number;
  diastolic: number;
};

type LatestFlags = {
  warningActive: boolean;
  alertActive: boolean;
  respirationMissing: boolean;
  fingerDetected: boolean;
};

const MQTT_WS_URL = "wss://broker.hivemq.com:8884/mqtt";
const TOPIC = "luz/device/esp32-luz-01/telemetry";

function toPoint(payload: Record<string, unknown>): LivePoint {
  return {
    ts: new Date().toISOString(),
    pulse: Number(payload.heartRateBpm ?? 0),
    spo2: Number(payload.spo2 ?? 0),
    temperatureC: Number(payload.temperatureC ?? 0),
    systolic: Number(payload.estimatedSystolicMmHg ?? 0),
    diastolic: Number(payload.estimatedDiastolicMmHg ?? 0),
  };
}

export default function MonitoringPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientId, setPatientId] = useState("");
  const [status, setStatus] = useState<MonitoringStatus | null>(null);
  const [points, setPoints] = useState<LivePoint[]>([]);
  const [mqttOnline, setMqttOnline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flags, setFlags] = useState<LatestFlags>({
    warningActive: false,
    alertActive: false,
    respirationMissing: false,
    fingerDetected: false,
  });

  useEffect(() => {
    void patientService.findAll().then(setPatients).catch(() => setPatients([]));
  }, []);

  useEffect(() => {
    const refresh = async () => {
      try {
        const s = await monitoringService.status();
        setStatus(s);
      } catch {
        setError("No se pudo leer estado de monitoreo");
      }
    };

    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const client: MqttClient = mqtt.connect(MQTT_WS_URL, {
      clientId: `frontend-${Math.random().toString(16).slice(2, 8)}`,
      reconnectPeriod: 2000,
      connectTimeout: 10_000,
    });

    client.on("connect", () => {
      setMqttOnline(true);
      client.subscribe(TOPIC);
    });

    client.on("offline", () => setMqttOnline(false));
    client.on("close", () => setMqttOnline(false));
    client.on("error", () => setMqttOnline(false));

    client.on("message", (_topic, message) => {
      try {
        const payload = JSON.parse(message.toString()) as Record<string, unknown>;
        setPoints((prev) => [...prev, toPoint(payload)].slice(-120));
        setFlags({
          warningActive: Boolean(payload.warningActive),
          alertActive: Boolean(payload.alertActive),
          respirationMissing: Boolean(payload.respirationMissing),
          fingerDetected: Boolean(payload.fingerDetected),
        });
      } catch {
        return;
      }
    });

    return () => {
      client.end(true);
    };
  }, []);

  const onStart = async () => {
    if (!patientId) return;
    setLoading(true);
    setError(null);
    try {
      await monitoringService.start(patientId);
      setStatus(await monitoringService.status());
    } catch {
      setError("No se pudo iniciar la sesion");
    } finally {
      setLoading(false);
    }
  };

  const onStop = async () => {
    setLoading(true);
    setError(null);
    try {
      await monitoringService.stop();
      setStatus(await monitoringService.status());
    } catch {
      setError("No se pudo detener la sesion");
    } finally {
      setLoading(false);
    }
  };

  const onResetView = () => {
    setPoints([]);
  };

  const last = points.at(-1);
  const hasActiveSession = Boolean(status?.activeSession && !status.activeSession.endedAt);
  const activePatientName = status?.activeSession?.patient?.user?.fullname ?? "Sin paciente";
  const isStreaming =
    Boolean(status?.espOnline) &&
    Boolean(status?.lastTelemetry) &&
    Boolean((status?.lastTelemetry as Record<string, unknown> | null)?.fingerDetected);

  const chartData = useMemo(
    () =>
      points.map((p) => ({
        t: new Date(p.ts).toLocaleTimeString("es-ES", { minute: "2-digit", second: "2-digit" }),
        pulse: p.pulse,
        spo2: p.spo2,
        temp: p.temperatureC,
        sys: p.systolic,
        dia: p.diastolic,
      })),
    [points],
  );

  return (
    <div className="space-y-5">
      <Card className="border-0 shadow-sm bg-gradient-to-r from-sky-50 via-cyan-50 to-emerald-50">
        <CardHeader>
          <CardTitle className="text-2xl">Monitoreo en tiempo real</CardTitle>
          <CardDescription>ESP unico conectado por MQTT. Historial guardado cada 10 segundos.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Badge variant={mqttOnline ? "default" : "secondary"}>MQTT Frontend: {mqttOnline ? "Conectado" : "Desconectado"}</Badge>
          <Badge variant={status?.espOnline ? "default" : "secondary"}>ESP: {status?.espOnline ? "Online" : "Offline"}</Badge>
          <Badge variant={isStreaming ? "default" : "secondary"}>Datos clinicos: {isStreaming ? "Transmitiendo" : "En espera"}</Badge>
          <Badge variant={hasActiveSession ? "default" : "outline"}>Sesion: {hasActiveSession ? "Activa" : "Sin sesion activa"}</Badge>
          <Badge variant="outline">Paciente: {activePatientName}</Badge>
          <Badge variant={flags.alertActive ? "destructive" : flags.warningActive ? "secondary" : "outline"}>
            Estado clinico: {flags.alertActive ? "Alerta" : flags.warningActive ? "Vigilancia" : "Estable"}
          </Badge>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-3 pt-6 sm:grid-cols-2 xl:grid-cols-4">
          <select className="min-w-0 rounded-md border px-3 py-2" value={patientId} onChange={(e) => setPatientId(e.target.value)} disabled={hasActiveSession}>
            <option value="">Selecciona paciente</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>{p.user.fullname}</option>
            ))}
          </select>
          <Button disabled={!patientId || hasActiveSession || loading} onClick={onStart}>Iniciar monitoreo</Button>
          <Button variant="destructive" disabled={!hasActiveSession || loading} onClick={onStop}>Cerrar sesion</Button>
          <Button variant="outline" onClick={onResetView}>Reiniciar vista</Button>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatePill label="Sensor de dedo" ok={flags.fingerDetected} okText="Detectado" badText="No detectado" />
        <StatePill label="Respiracion" ok={!flags.respirationMissing} okText="Sin riesgo" badText="No detectada" />
        <StatePill label="ESP conectado" ok={Boolean(status?.espOnline)} okText="Online" badText="Offline" />
        <StatePill label="Sesion activa" ok={hasActiveSession} okText="Activa" badText="No activa" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <ClinicalMetricCard
          title="Pulso"
          icon={<HeartPulse className="h-3.5 w-3.5" />}
          value={last?.pulse}
          unit="bpm"
          state={pulseState(last?.pulse)}
          hint="Frecuencia cardiaca actual"
          delay={0}
        />
        <ClinicalMetricCard
          title="SpO2"
          icon={<Droplets className="h-3.5 w-3.5" />}
          value={last?.spo2}
          unit="%"
          state={spo2State(last?.spo2)}
          hint="Saturacion de oxigeno"
          delay={40}
        />
        <ClinicalMetricCard
          title="Temperatura"
          icon={<Thermometer className="h-3.5 w-3.5" />}
          value={last?.temperatureC}
          unit="C"
          state={tempState(last?.temperatureC)}
          hint="Temperatura corporal"
          delay={80}
        />
        <ClinicalMetricCard
          title="Sistolica"
          icon={<Activity className="h-3.5 w-3.5" />}
          value={last?.systolic}
          unit="mmHg"
          state={systolicState(last?.systolic)}
          hint="Presion arterial sistolica"
          delay={120}
        />
        <ClinicalMetricCard
          title="Diastolica"
          icon={<Activity className="h-3.5 w-3.5" />}
          value={last?.diastolic}
          unit="mmHg"
          state={diastolicState(last?.diastolic)}
          hint="Presion arterial diastolica"
          delay={160}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Pulso y SpO2" data={chartData} lines={[{ key: "pulse", color: "#0ea5e9" }, { key: "spo2", color: "#22c55e" }]} />
        <ChartCard title="Temperatura" data={chartData} lines={[{ key: "temp", color: "#f97316" }]} normalRange={{ from: 36, to: 37.4 }} />
        <ChartCard title="Presion Sistolica" data={chartData} lines={[{ key: "sys", color: "#ef4444" }]} normalRange={{ from: 100, to: 130 }} />
        <ChartCard title="Presion Diastolica" data={chartData} lines={[{ key: "dia", color: "#a855f7" }]} normalRange={{ from: 60, to: 85 }} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ultimas lecturas en vivo</CardTitle>
          <CardDescription>Vista clinica de los ultimos 20 puntos del monitoreo.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-72 overflow-auto space-y-2">
            {points.slice(-20).reverse().map((p, idx) => (
              <div key={`${p.ts}-${idx}`} className="grid grid-cols-1 gap-2 rounded-md border bg-muted/20 px-3 py-2 text-xs sm:grid-cols-2 xl:grid-cols-6">
                <span>{new Date(p.ts).toLocaleTimeString("es-ES")}</span>
                <span>Pulso {p.pulse.toFixed(0)}</span>
                <span>SpO2 {p.spo2.toFixed(0)}%</span>
                <span>Temp {p.temperatureC.toFixed(1)} C</span>
                <span>SYS {p.systolic.toFixed(0)}</span>
                <span>DIA {p.diastolic.toFixed(0)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatePill({
  label,
  ok,
  okText,
  badText,
}: {
  label: string;
  ok: boolean;
  okText: string;
  badText: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-5">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Badge variant={ok ? "default" : "secondary"}>{ok ? okText : badText}</Badge>
      </CardContent>
    </Card>
  );
}

function ChartCard({
  title,
  data,
  lines,
  normalRange,
}: {
  title: string;
  data: Array<Record<string, string | number>>;
  lines: Array<{ key: string; color: string }>;
  normalRange?: { from: number; to: number };
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-[240px] sm:h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="t" />
            <YAxis />
            <Tooltip />
            {normalRange && (
              <ReferenceArea y1={normalRange.from} y2={normalRange.to} fill="#22c55e" fillOpacity={0.08} />
            )}
            {lines.map((line) => (
              <Line key={line.key} type="monotone" dataKey={line.key} stroke={line.color} dot={false} strokeWidth={2} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
