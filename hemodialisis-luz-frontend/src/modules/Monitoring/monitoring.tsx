import { useEffect, useMemo, useState } from "react";
import mqtt, { type MqttClient } from "mqtt";
import { BellOff, Gauge, HeartPulse, RotateCcw, Thermometer, Waves } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClinicalMetricCard } from "@/components/clinical/clinical-ui";
import {
  pulseState,
  tempState,
} from "@/components/clinical/clinical-ranges";
import { patientService } from "@/modules/Patient/data/patient.service";
import type { Patient } from "@/modules/Patient/patient.interface";
import { sessionService } from "@/modules/Session/data/session.service";
import type { Session } from "@/modules/Session/session.interface";
import { monitoringService, type MonitoringStatus } from "./monitoring.service";

type LivePoint = {
  ts: string;
  pulse: number;
  temperatureC: number;
  respiratoryRateBpm: number;
  systolic: number;
  diastolic: number;
};

type SessionDraft = {
  weightBefore: string;
  weightAfter: string;
  dryWeight: string;
  pressureIntervalMinutes: string;
  reportedSymptoms: string;
  dizziness: boolean;
  nausea: boolean;
  cramps: boolean;
  pain: boolean;
  shortnessOfBreath: boolean;
  weakness: boolean;
  chills: boolean;
  staffObservations: string;
};

type LatestFlags = {
  warningActive: boolean;
  alertActive: boolean;
  respirationMissing: boolean;
  fingerDetected: boolean;
  alarmMuted: boolean;
  pressureState: string;
  cuffPressureMmHg: number;
};

const MQTT_WS_URL = import.meta.env.VITE_MQTT_WS_URL as string | undefined ?? "wss://server-local.tail9af6ac.ts.net";
const MQTT_USER = import.meta.env.VITE_MQTT_USER as string | undefined ?? "";
const MQTT_PASSWORD = import.meta.env.VITE_MQTT_PASSWORD as string | undefined ?? "";
const TOPIC = "luz/device/esp32-luz-01/telemetry";

const initialDraft: SessionDraft = {
  weightBefore: "",
  weightAfter: "",
  dryWeight: "",
  pressureIntervalMinutes: "30",
  reportedSymptoms: "",
  dizziness: false,
  nausea: false,
  cramps: false,
  pain: false,
  shortnessOfBreath: false,
  weakness: false,
  chills: false,
  staffObservations: "",
};

function toPoint(payload: Record<string, unknown>): LivePoint {
  return {
    ts: new Date().toISOString(),
    pulse: Number(payload.heartRateBpm ?? 0),
    temperatureC: Number(payload.temperatureC ?? 0),
    respiratoryRateBpm: Number(payload.respiratoryRateBpm ?? 0),
    systolic: Number(payload.estimatedSystolicMmHg ?? 0),
    diastolic: Number(payload.estimatedDiastolicMmHg ?? 0),
  };
}

function toNumberOrUndefined(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && value !== "" ? parsed : undefined;
}

export default function MonitoringPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientId, setPatientId] = useState("");
  const [status, setStatus] = useState<MonitoringStatus | null>(null);
  const [points, setPoints] = useState<LivePoint[]>([]);
  const [mqttOnline, setMqttOnline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<SessionDraft>(initialDraft);
  const [previousSession, setPreviousSession] = useState<Session | null>(null);
  const [previousSessionOpen, setPreviousSessionOpen] = useState(false);
  const [commandLoading, setCommandLoading] = useState<"inflate" | "mute" | null>(null);
  const [flags, setFlags] = useState<LatestFlags>({
    warningActive: false,
    alertActive: false,
    respirationMissing: false,
    fingerDetected: false,
    alarmMuted: false,
    pressureState: "IDLE",
    cuffPressureMmHg: 0,
  });

  const refresh = async () => {
    try {
      const next = await monitoringService.status();
      setStatus(next);
    } catch {
      setError("No se pudo leer el estado de monitoreo");
    }
  };

  useEffect(() => {
    void patientService.findAll().then(setPatients).catch(() => setPatients([]));
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const connectOptions: Record<string, unknown> = {
      clientId: `frontend-${Math.random().toString(16).slice(2, 8)}`,
      reconnectPeriod: 2000,
      connectTimeout: 10_000,
    };
    if (MQTT_USER) {
      connectOptions.username = MQTT_USER;
      connectOptions.password = MQTT_PASSWORD;
    }
    const client: MqttClient = mqtt.connect(MQTT_WS_URL, connectOptions);

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
          alarmMuted: Boolean(payload.alarmMuted),
          pressureState: String(payload.pressureState ?? "IDLE"),
          cuffPressureMmHg: Number(payload.cuffPressureMmHg ?? 0),
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
      await monitoringService.start({
        patientId,
        weightBefore: toNumberOrUndefined(draft.weightBefore),
        dryWeight: toNumberOrUndefined(draft.dryWeight),
        pressureIntervalMinutes: toNumberOrUndefined(draft.pressureIntervalMinutes),
        reportedSymptoms: draft.reportedSymptoms || undefined,
        dizziness: draft.dizziness,
        nausea: draft.nausea,
        cramps: draft.cramps,
        pain: draft.pain,
        shortnessOfBreath: draft.shortnessOfBreath,
        weakness: draft.weakness,
        chills: draft.chills,
        staffObservations: draft.staffObservations || undefined,
      });
      await refresh();
    } catch {
      setError("No se pudo iniciar la sesion clinica");
    } finally {
      setLoading(false);
    }
  };

  const onStop = async () => {
    const weightAfter = toNumberOrUndefined(draft.weightAfter);
    if (weightAfter === undefined) {
      setError("Registra el peso final para calcular la ultrafiltracion real");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await monitoringService.stop(weightAfter);
      await refresh();
      setDraft(initialDraft);
      setPoints([]);
    } catch {
      setError("No se pudo finalizar la sesion");
    } finally {
      setLoading(false);
    }
  };

  const onCommand = async (command: "inflate" | "mute") => {
    setCommandLoading(command);
    setError(null);
    try {
      const result = await monitoringService.command(command, "doctor");
      if (!result.ok) setError("El comando no pudo enviarse al ESP32");
    } catch {
      setError("No se pudo enviar el comando al ESP32");
    } finally {
      setCommandLoading(null);
    }
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
        temp: p.temperatureC,
        respiration: p.respiratoryRateBpm,
        sys: p.systolic,
        dia: p.diastolic,
      })),
    [points],
  );

  const toggleDraft = (key: keyof SessionDraft) => {
    setDraft((current) => ({ ...current, [key]: !current[key as keyof SessionDraft] }));
  };

  const onShowPreviousSession = async () => {
    if (!patientId) return;
    setLoading(true);
    setError(null);
    try {
      const sessions = await sessionService.findByPatient(patientId);
      const previous = sessions.find((session) => Boolean(session.endedAt));
      setPreviousSession(previous ?? null);
      setPreviousSessionOpen(true);
    } catch {
      setError("No se pudo consultar la ultima sesion");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card className="border-0 shadow-sm bg-gradient-to-r from-sky-50 via-cyan-50 to-emerald-50">
        <CardHeader>
          <CardTitle className="text-2xl">Monitoreo en tiempo real</CardTitle>
          <CardDescription>
            FC, presion arterial, temperatura y frecuencia respiratoria.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Badge variant={mqttOnline ? "default" : "secondary"}>MQTT Frontend: {mqttOnline ? "Conectado" : "Desconectado"}</Badge>
          <Badge variant={status?.espOnline ? "default" : "secondary"}>ESP: {status?.espOnline ? "Online" : "Offline"}</Badge>
          <Badge variant={flags.pressureState === "IDLE" ? "outline" : "default"}>Presion: {flags.pressureState}</Badge>
          <Badge variant={isStreaming ? "default" : "secondary"}>Datos clinicos: {isStreaming ? "Transmitiendo" : "En espera"}</Badge>
          <Badge variant={hasActiveSession ? "default" : "outline"}>Sesion: {hasActiveSession ? "Activa" : "Sin sesion activa"}</Badge>
          <Badge variant="outline">Paciente: {activePatientName}</Badge>
          <Badge variant={flags.alertActive ? "destructive" : flags.warningActive ? "secondary" : "outline"}>
            Estado clinico: {flags.alertActive ? "Alerta" : flags.warningActive ? "Vigilancia" : "Estable"}
          </Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inicio de terapia</CardTitle>
          <CardDescription>Completa los datos de la sesion antes de iniciar el monitoreo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <select
              className="min-w-0 rounded-md border px-3 py-2"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              disabled={hasActiveSession}
            >
              <option value="">Selecciona paciente</option>
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.user.fullname}
                </option>
              ))}
            </select>
            <input className="rounded-md border px-3 py-2" placeholder="Peso antes (kg)" value={draft.weightBefore} onChange={(e) => setDraft((current) => ({ ...current, weightBefore: e.target.value }))} />
            <input className="rounded-md border px-3 py-2" placeholder="Peso final al cerrar (kg)" value={draft.weightAfter} onChange={(e) => setDraft((current) => ({ ...current, weightAfter: e.target.value }))} />
            <input className="rounded-md border px-3 py-2" placeholder="Peso seco (kg)" value={draft.dryWeight} onChange={(e) => setDraft((current) => ({ ...current, dryWeight: e.target.value }))} />
            <input className="rounded-md border px-3 py-2" type="number" min="1" max="240" placeholder="Intervalo PA (min)" value={draft.pressureIntervalMinutes} onChange={(e) => setDraft((current) => ({ ...current, pressureIntervalMinutes: e.target.value }))} />
            <input className="rounded-md border px-3 py-2 sm:col-span-2 xl:col-span-4" placeholder="Sintomas reportados" value={draft.reportedSymptoms} onChange={(e) => setDraft((current) => ({ ...current, reportedSymptoms: e.target.value }))} />
            <textarea className="min-h-24 rounded-md border px-3 py-2 sm:col-span-2 xl:col-span-4" placeholder="Observaciones del personal de salud" value={draft.staffObservations} onChange={(e) => setDraft((current) => ({ ...current, staffObservations: e.target.value }))} />
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {[
              ["dizziness", "Mareos"],
              ["nausea", "Nausea"],
              ["cramps", "Calambres"],
              ["pain", "Dolor"],
              ["shortnessOfBreath", "Falta de aire"],
              ["weakness", "Debilidad"],
              ["chills", "Escalofrios"],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <input type="checkbox" checked={Boolean(draft[key as keyof SessionDraft])} onChange={() => toggleDraft(key as keyof SessionDraft)} />
                {label}
              </label>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button disabled={!patientId || hasActiveSession || loading} onClick={onStart}>Iniciar sesion</Button>
            <Button variant="outline" disabled={!patientId || loading} onClick={onShowPreviousSession}>Ver ultima sesion</Button>
            <Button variant="destructive" disabled={!hasActiveSession || loading} onClick={onStop}>Finalizar sesion</Button>
            <Button variant="outline" onClick={() => setPoints([])}>
              <RotateCcw className="mr-2 h-4 w-4" /> Reiniciar vista
            </Button>
            <Button variant="outline" disabled={!hasActiveSession || !status?.espOnline || commandLoading !== null || flags.pressureState !== "IDLE"} onClick={() => void onCommand("inflate")}>
              <Gauge className="mr-2 h-4 w-4" /> {commandLoading === "inflate" ? "Enviando..." : "Tomar presion"}
            </Button>
            <Button variant="outline" disabled={!hasActiveSession || !status?.espOnline || commandLoading !== null || !flags.warningActive} onClick={() => void onCommand("mute")}>
              <BellOff className="mr-2 h-4 w-4" /> {commandLoading === "mute" ? "Enviando..." : "Silenciar alarma"}
            </Button>
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <div className="rounded-md bg-muted/40 px-3 py-2">UF objetivo: {Number(draft.weightBefore) > 0 && Number(draft.dryWeight) > 0 ? `${Math.max(0, Number(draft.weightBefore) - Number(draft.dryWeight)).toFixed(2)} L` : "Pendiente"}</div>
            <div className="rounded-md bg-muted/40 px-3 py-2">UF real: {Number(draft.weightBefore) > 0 && Number(draft.weightAfter) > 0 ? `${Math.max(0, Number(draft.weightBefore) - Number(draft.weightAfter)).toFixed(2)} L` : "Se calcula al cerrar"}</div>
            <div className="rounded-md bg-muted/40 px-3 py-2">Ultima PA: {status?.activeSession?.lastPressureAt ? new Date(status.activeSession.lastPressureAt).toLocaleTimeString("es-ES") : "Sin medicion"}</div>
          </div>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatePill label="Sensor de dedo" ok={flags.fingerDetected} okText="Detectado" badText="No detectado" />
        <StatePill label="Respiracion" ok={!flags.respirationMissing} okText="Sin riesgo" badText="No detectada" />
        <StatePill label="ESP conectado" ok={Boolean(status?.espOnline)} okText="Online" badText="Offline" />
        <StatePill label="Alarma sonora" ok={!flags.warningActive || flags.alarmMuted} okText={flags.alarmMuted ? "Silenciada" : "Sin alarma"} badText="Activa" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ClinicalMetricCard title="FC" icon={<HeartPulse className="h-3.5 w-3.5" />} value={last?.pulse} unit="bpm" state={pulseState(last?.pulse)} hint="Frecuencia cardiaca" delay={0} />
        <ClinicalMetricCard title="Temperatura" icon={<Thermometer className="h-3.5 w-3.5" />} value={last?.temperatureC} unit="C" state={tempState(last?.temperatureC)} hint="Temperatura corporal" delay={80} />
        <ClinicalMetricCard title="Frecuencia respiratoria" icon={<Waves className="h-3.5 w-3.5" />} value={last?.respiratoryRateBpm} unit="rpm" state={last?.respiratoryRateBpm && last.respiratoryRateBpm >= 12 && last.respiratoryRateBpm <= 20 ? "ok" : "warn"} hint="Respiraciones por minuto" delay={120} />
        <Card><CardHeader><CardTitle className="text-sm">Presion arterial</CardTitle><CardDescription>Ultima toma valida</CardDescription></CardHeader><CardContent><div className="text-2xl font-semibold">{last?.systolic || last?.diastolic ? `${last.systolic.toFixed(0)}/${last.diastolic.toFixed(0)}` : "--/--"} <span className="text-xs text-muted-foreground">mmHg</span></div><div className="mt-2 text-xs text-muted-foreground">Manguito {flags.cuffPressureMmHg.toFixed(1)} mmHg</div></CardContent></Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Frecuencia cardiaca" data={chartData} lines={[{ key: "pulse", color: "#0ea5e9" }]} />
        <ChartCard title="Frecuencia respiratoria" data={chartData} lines={[{ key: "respiration", color: "#22c55e" }]} normalRange={{ from: 12, to: 20 }} />
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
            {points.slice(-20).reverse().map((point, index) => (
              <div key={`${point.ts}-${index}`} className="grid grid-cols-1 gap-2 rounded-md border bg-muted/20 px-3 py-2 text-xs sm:grid-cols-2 xl:grid-cols-6">
                <span>{new Date(point.ts).toLocaleTimeString("es-ES")}</span>
                <span>FC {point.pulse.toFixed(0)} bpm</span>
                <span>FR {point.respiratoryRateBpm.toFixed(0)} rpm</span>
                <span>Temp {point.temperatureC.toFixed(1)} C</span>
                <span>SYS {point.systolic.toFixed(0)}</span>
                <span>DIA {point.diastolic.toFixed(0)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Eventos de la sesion</CardTitle>
          <CardDescription>Tomas programadas o manuales, alarmas y cierre.</CardDescription>
        </CardHeader>
        <CardContent className="max-h-64 space-y-2 overflow-auto">
          {(status?.activeSession?.events ?? []).length ? (
            (status?.activeSession?.events ?? []).map((event) => (
              <div key={event.id} className="grid gap-1 rounded-md border px-3 py-2 text-xs sm:grid-cols-[90px_110px_1fr]">
                <span>{new Date(event.createdAt).toLocaleTimeString("es-ES")}</span>
                <Badge variant="outline" className="w-fit">{event.source}</Badge>
                <span>{event.description}</span>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Aun no hay eventos registrados.</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={previousSessionOpen} onOpenChange={setPreviousSessionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ultima sesion registrada</DialogTitle>
          </DialogHeader>
          {previousSession ? (
            <div className="space-y-3 text-sm">
              <div><strong>Inicio:</strong> {new Date(previousSession.startedAt).toLocaleString("es-ES")}</div>
              <div><strong>Fin:</strong> {previousSession.endedAt ? new Date(previousSession.endedAt).toLocaleString("es-ES") : "Sin cierre"}</div>
              <div><strong>Duracion:</strong> {previousSession.sessionDurationMinutes ?? "-"} min</div>
              <div><strong>Pesos:</strong> {previousSession.weightBefore ?? "-"} / {previousSession.weightAfter ?? "-"} / {previousSession.dryWeight ?? "-"}</div>
              <div><strong>Ultrafiltracion objetivo / real:</strong> {previousSession.ultrafiltrationGoalLiters ?? "-"} / {previousSession.ultrafiltrationActualLiters ?? "-"} L</div>
              <div><strong>Sintomas:</strong> {previousSession.reportedSymptoms ?? "Sin dato"}</div>
              <div><strong>Observaciones:</strong> {previousSession.staffObservations ?? "Sin observaciones"}</div>
              <div>
                <strong>Ultima lectura:</strong>{" "}
                {previousSession.records?.at(-1)
                  ? `FC ${previousSession.records.at(-1)?.pulse} | FR ${previousSession.records.at(-1)?.respiratoryRateBpm} | Temp ${previousSession.records.at(-1)?.temperatureC} | PA ${previousSession.records.at(-1)?.systolic}/${previousSession.records.at(-1)?.diastolic}`
                  : "Sin lecturas"}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No hay una sesion anterior cerrada para este paciente.</p>
          )}
        </DialogContent>
      </Dialog>
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
            {normalRange ? <ReferenceArea y1={normalRange.from} y2={normalRange.to} fill="#22c55e" fillOpacity={0.08} /> : null}
            {lines.map((line) => (
              <Line key={line.key} type="monotone" dataKey={line.key} stroke={line.color} dot={false} strokeWidth={2} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
