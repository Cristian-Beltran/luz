import { useEffect, useMemo, useState, type ReactNode } from "react";
import mqtt, { type MqttClient } from "mqtt";
import {
  Activity,
  ArrowRight,
  CircleDot,
  Droplets,
  Gauge,
  HeartPulse,
  Radio,
  ShieldCheck,
  Thermometer,
  Waves,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Link } from "react-router-dom";
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
import { cn } from "@/lib/utils";

const MQTT_WS_URL =
  (import.meta.env.VITE_MQTT_WS_URL as string | undefined) ??
  "wss://server-local.tail9af6ac.ts.net";
const MQTT_USER = (import.meta.env.VITE_MQTT_USER as string | undefined) ?? "";
const MQTT_PASSWORD = (import.meta.env.VITE_MQTT_PASSWORD as string | undefined) ?? "";
const DEVICE_ID = "esp32-luz-01";
const TELEMETRY_TOPIC = `luz/device/${DEVICE_ID}/telemetry`;
const RAW_TOPIC = `luz/device/${DEVICE_ID}/raw`;
const DEVICE_TIMEOUT_MS = 5_000;
const MAX_HISTORY = 180;

type Payload = Record<string, unknown>;

type HistoryPoint = {
  time: string;
  ppgRaw?: number;
  ppgSmoothed?: number;
  ppgDc?: number;
  mqRaw?: number;
  mqFiltered?: number;
  mqBaseline?: number;
  cuff?: number;
  oscillation?: number;
  envelope?: number;
};

type MetricCardProps = {
  label: string;
  value?: number;
  display?: string;
  unit?: string;
  hint: string;
  icon: ReactNode;
  accent: string;
};

function numberValue(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function boolValue(value: unknown) {
  return value === true || value === "true" || value === 1;
}

function format(value: unknown, decimals = 1) {
  const parsed = numberValue(value);
  return parsed === undefined ? "—" : parsed.toFixed(decimals);
}

function MetricCard({ label, value, display, unit, hint, icon, accent }: MetricCardProps) {
  const shown = display ?? (value === undefined ? "—" : value.toFixed(1));
  return (
    <Card className="overflow-hidden border-slate-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/70">
      <CardContent className="relative p-5">
        <div className={cn("absolute inset-x-0 top-0 h-1", accent)} />
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
              {label}
            </p>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
                {shown}
              </span>
              {unit && <span className="text-sm text-slate-500 dark:text-slate-400">{unit}</span>}
            </div>
          </div>
          <div className="rounded-2xl bg-slate-100 p-2.5 text-slate-700 dark:bg-white/10 dark:text-slate-200">
            {icon}
          </div>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">{hint}</p>
      </CardContent>
    </Card>
  );
}

function Diagnostic({ label, value, tone = "normal" }: { label: string; value: ReactNode; tone?: "normal" | "good" | "warn" }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2.5 dark:border-white/10 dark:bg-black/20">
      <span className="truncate text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <span
        className={cn(
          "text-right font-mono text-xs font-semibold",
          tone === "good" && "text-emerald-600 dark:text-emerald-400",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
          tone === "normal" && "text-slate-900 dark:text-slate-100",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function SignalChart({
  title,
  data,
  lines,
}: {
  title: string;
  data: HistoryPoint[];
  lines: Array<{ key: keyof HistoryPoint; label: string; color: string }>;
}) {
  return (
    <Card className="border-slate-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/70">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-52 px-2 pb-3">
        {data.length < 2 ? (
          <div className="grid h-full place-items-center text-sm text-slate-400">Esperando muestras…</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.18)" />
              <XAxis dataKey="time" hide />
              <YAxis tick={{ fontSize: 10 }} width={54} domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid rgba(148,163,184,.25)",
                  background: "rgba(15,23,42,.94)",
                  color: "white",
                  fontSize: 12,
                }}
              />
              {lines.map((line) => (
                <Line
                  key={String(line.key)}
                  type="monotone"
                  dataKey={line.key}
                  name={line.label}
                  stroke={line.color}
                  strokeWidth={1.8}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function SectionHeading({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="rounded-2xl bg-cyan-500/10 p-2.5 text-cyan-600 dark:text-cyan-300">{icon}</div>
      <div>
        <h2 className="text-lg font-semibold text-slate-950 dark:text-white">{title}</h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>
      </div>
    </div>
  );
}

export default function TelemetryPage() {
  const [mqttOnline, setMqttOnline] = useState(false);
  const [telemetry, setTelemetry] = useState<Payload>({});
  const [raw, setRaw] = useState<Payload>({});
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [lastSeenAt, setLastSeenAt] = useState(0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const options: Record<string, unknown> = {
      clientId: `telemetry-public-${Math.random().toString(16).slice(2, 10)}`,
      reconnectPeriod: 2_000,
      connectTimeout: 10_000,
    };
    if (MQTT_USER) {
      options.username = MQTT_USER;
      options.password = MQTT_PASSWORD;
    }

    const client: MqttClient = mqtt.connect(MQTT_WS_URL, options);
    client.on("connect", () => {
      setMqttOnline(true);
      client.subscribe([TELEMETRY_TOPIC, RAW_TOPIC]);
    });
    client.on("offline", () => setMqttOnline(false));
    client.on("close", () => setMqttOnline(false));
    client.on("error", () => setMqttOnline(false));
    client.on("message", (topic, message) => {
      try {
        const payload = JSON.parse(message.toString()) as Payload;
        setLastSeenAt(Date.now());
        if (topic === TELEMETRY_TOPIC) {
          setTelemetry(payload);
          return;
        }
        if (topic === RAW_TOPIC) {
          setRaw(payload);
          const point: HistoryPoint = {
            time: new Date().toLocaleTimeString("es-BO", { minute: "2-digit", second: "2-digit" }),
            ppgRaw: numberValue(payload.ppgRaw),
            ppgSmoothed: numberValue(payload.ppgSmoothed),
            ppgDc: numberValue(payload.hrBaseline),
            mqRaw: numberValue(payload.mqRaw),
            mqFiltered: numberValue(payload.mqFiltered),
            mqBaseline: numberValue(payload.mqBaseline),
            cuff: numberValue(payload.cuffPressureFilteredMmHg),
            oscillation: numberValue(payload.pressureOscillationMmHg),
            envelope: numberValue(payload.pressureOscillationEnvelope),
          };
          setHistory((previous) => [...previous, point].slice(-MAX_HISTORY));
        }
      } catch {
        // Ignora un paquete incompleto y conserva la ultima muestra valida.
      }
    });
    return () => {
      client.end(true);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const deviceOnline = mqttOnline && lastSeenAt > 0 && now - lastSeenAt <= DEVICE_TIMEOUT_MS;
  const fingerDetected = boolValue(telemetry.fingerDetected);
  const respirationDetected = boolValue(telemetry.respirationDetected);
  const spo2Available = boolValue(telemetry.spo2Available);
  const pressureResultAvailable = boolValue(telemetry.pressureResultAvailable);
  const ppgHistory = useMemo(() => history.slice(-120), [history]);
  const slowHistory = useMemo(() => history.filter((_, index) => index % 3 === 0).slice(-100), [history]);

  return (
    <main className="min-h-dvh bg-[radial-gradient(circle_at_top_left,_rgba(6,182,212,.10),_transparent_32%),linear-gradient(to_bottom,_#f8fafc,_#eef2ff)] text-slate-900 dark:bg-[radial-gradient(circle_at_top_left,_rgba(6,182,212,.15),_transparent_30%),linear-gradient(to_bottom,_#020617,_#0f172a)] dark:text-slate-100">
      <div className="mx-auto max-w-[1500px] space-y-8 px-4 py-6 sm:px-6 lg:px-8">
        <header className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/85 shadow-xl shadow-slate-200/40 backdrop-blur dark:border-white/10 dark:bg-slate-950/70 dark:shadow-black/20">
          <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 p-3 text-white shadow-lg shadow-cyan-500/20">
                <Activity className="h-7 w-7" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Telemetría de sensores</h1>
                  <Badge variant="outline" className="border-cyan-500/30 text-cyan-700 dark:text-cyan-300">Público</Badge>
                </div>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                  Señales crudas, filtros y resultados calculados por el ESP32. Los datos sirven para validar el prototipo y no sustituyen un equipo médico calibrado.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm dark:border-white/10 dark:bg-white/5">
                {deviceOnline ? <Wifi className="h-4 w-4 text-emerald-500" /> : <WifiOff className="h-4 w-4 text-rose-500" />}
                <div>
                  <div className="font-medium">{deviceOnline ? "ESP32 en línea" : mqttOnline ? "Sin muestras" : "MQTT desconectado"}</div>
                  <div className="text-[11px] text-slate-500">{DEVICE_ID}</div>
                </div>
              </div>
              <Link
                to="/public/monitoring"
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400"
              >
                Monitor clínico <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
          <div className="grid border-t border-slate-200/80 bg-slate-50/70 sm:grid-cols-4 dark:border-white/10 dark:bg-white/[0.03]">
            {[
              ["MQTT", mqttOnline ? "Conectado" : "Desconectado", mqttOnline],
              ["Dedo", fingerDetected ? "Detectado" : "Ausente", fingerDetected],
              ["Respiración", respirationDetected ? "Detectada" : "En espera", respirationDetected],
              ["Presión", String(telemetry.pressureState ?? "IDLE"), telemetry.pressureState !== "IDLE"],
            ].map(([label, value, active]) => (
              <div key={String(label)} className="flex items-center justify-between border-b border-slate-200/80 px-5 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 dark:border-white/10">
                <span className="text-xs uppercase tracking-wider text-slate-400">{label}</span>
                <span className={cn("text-xs font-semibold", active ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500")}>{value}</span>
              </div>
            ))}
          </div>
        </header>

        <section className="space-y-4">
          <SectionHeading icon={<Thermometer className="h-5 w-5" />} title="Temperatura" description="Lecturas directa y ambiental del MLX90614." />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Objeto / cuerpo" value={numberValue(telemetry.temperatureC)} unit="°C" hint="Temperatura infrarroja utilizada por el monitor." icon={<Thermometer className="h-5 w-5" />} accent="bg-orange-500" />
            <MetricCard label="Ambiente" value={numberValue(telemetry.ambientTemperatureC)} unit="°C" hint="Compensación ambiental del mismo sensor." icon={<Radio className="h-5 w-5" />} accent="bg-violet-500" />
            <MetricCard label="Crudo objeto" value={numberValue(raw.mlxObjectC)} unit="°C" hint="Muestra publicada en el canal de diagnóstico." icon={<CircleDot className="h-5 w-5" />} accent="bg-amber-500" />
            <MetricCard label="Crudo ambiente" value={numberValue(raw.mlxAmbientC)} unit="°C" hint={boolValue(telemetry.temperatureValid) ? "Sensor válido y disponible." : "Lectura no validada."} icon={<ShieldCheck className="h-5 w-5" />} accent={boolValue(telemetry.temperatureValid) ? "bg-emerald-500" : "bg-rose-500"} />
          </div>
        </section>

        <section className="space-y-4">
          <SectionHeading icon={<Waves className="h-5 w-5" />} title="Gas y respiración" description="ADC del sensor MQ, línea base y diferencia usada para reconocer cada exhalación." />
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.55fr)]">
            <SignalChart title="ADC de gas vs. línea base" data={slowHistory} lines={[
              { key: "mqRaw", label: "ADC crudo", color: "#f59e0b" },
              { key: "mqFiltered", label: "ADC filtrado", color: "#06b6d4" },
              { key: "mqBaseline", label: "Línea base", color: "#8b5cf6" },
            ]} />
            <Card className="border-slate-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/70">
              <CardContent className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-1">
                <Diagnostic label="ADC crudo" value={format(raw.mqRaw, 0)} />
                <Diagnostic label="ADC filtrado" value={format(raw.mqFiltered, 1)} />
                <Diagnostic label="Línea base" value={format(raw.mqBaseline, 1)} />
                <Diagnostic label="Subida sobre base" value={`${format(raw.mqDelta, 0)} ADC`} tone={respirationDetected ? "good" : "normal"} />
                <Diagnostic label="Umbral respiración" value={`${format(raw.mqBreathThreshold, 0)} ADC`} />
                <Diagnostic label="Umbral fuerte" value={`${format(raw.mqStrongThreshold, 0)} ADC`} />
                <Diagnostic label="Frecuencia estimada" value={`${format(telemetry.respiratoryRateBpm, 1)} rpm`} />
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="space-y-4">
          <SectionHeading icon={<HeartPulse className="h-5 w-5" />} title="Pulso, BPM y oxígeno" description="Se muestra toda la cadena de cálculo: ADC, componente DC, componente pulsátil, umbral y estabilidad." />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="BPM publicado" value={numberValue(telemetry.heartRateBpm)} unit="bpm" hint={boolValue(raw.realBpmValid) ? "Varios intervalos coherentes confirmados." : "Esperando suficientes pulsos estables."} icon={<HeartPulse className="h-5 w-5" />} accent="bg-rose-500" />
            <MetricCard label="BPM calculado" value={numberValue(raw.realBpm)} unit="bpm" hint={`Intervalo actual: ${format(raw.lastBeatIntervalMs, 0)} ms`} icon={<Activity className="h-5 w-5" />} accent="bg-pink-500" />
            <MetricCard label="Calidad PPG" value={numberValue(raw.ppgSignalQualityPercent ?? telemetry.ppgSignalQualityPercent)} unit="%" hint={`Índice de perfusión: ${format(raw.perfusionIndexPercent, 2)} %`} icon={<ShieldCheck className="h-5 w-5" />} accent="bg-emerald-500" />
            <MetricCard label="Saturación SpO₂" value={spo2Available ? numberValue(telemetry.oxygenSaturationPercent) : undefined} display={spo2Available ? undefined : "No disponible"} unit={spo2Available ? "%" : undefined} hint={spo2Available ? "Calculada con canales rojo e infrarrojo." : "El PPG conectado tiene un solo canal; no se muestra una cifra inventada."} icon={<Droplets className="h-5 w-5" />} accent={spo2Available ? "bg-cyan-500" : "bg-slate-400"} />
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.55fr)]">
            <SignalChart title="Señal PPG" data={ppgHistory} lines={[
              { key: "ppgRaw", label: "ADC crudo", color: "#f43f5e" },
              { key: "ppgSmoothed", label: "Suavizado", color: "#38bdf8" },
              { key: "ppgDc", label: "Componente DC", color: "#a78bfa" },
            ]} />
            <Card className="border-slate-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/70">
              <CardContent className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-1">
                <Diagnostic label="Dedo" value={fingerDetected ? "Detectado" : "Ausente"} tone={fingerDetected ? "good" : "warn"} />
                <Diagnostic label="ADC crudo" value={format(raw.ppgRaw, 0)} />
                <Diagnostic label="Suavizado" value={format(raw.ppgSmoothed, 0)} />
                <Diagnostic label="Base sin dedo" value={format(raw.ppgBaseline, 1)} />
                <Diagnostic label="Componente DC" value={format(raw.hrBaseline, 1)} />
                <Diagnostic label="Componente AC" value={format(raw.ppgAcValue, 2)} />
                <Diagnostic label="Amplitud AC" value={format(raw.ppgAcAmplitude, 2)} />
                <Diagnostic label="Umbral de pico" value={format(raw.ppgPeakThreshold, 2)} />
                <Diagnostic label="Latidos estables" value={format(raw.stableBeatCount, 0)} tone={boolValue(raw.realBpmValid) ? "good" : "normal"} />
                <Diagnostic label="Tiempo con dedo" value={`${format(raw.fingerAcquireMs, 0)} ms`} />
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="space-y-4">
          <SectionHeading icon={<Gauge className="h-5 w-5" />} title="Presión arterial y manguito" description="Resultado oscilométrico junto con la presión instantánea y las cuentas reales del HX710B." />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Sistólica" value={pressureResultAvailable ? numberValue(telemetry.estimatedSystolicMmHg) : undefined} unit="mmHg" hint="Cruce ascendente del 55 % de la envolvente." icon={<Gauge className="h-5 w-5" />} accent="bg-rose-500" />
            <MetricCard label="Diastólica" value={pressureResultAvailable ? numberValue(telemetry.estimatedDiastolicMmHg) : undefined} unit="mmHg" hint="Cruce descendente del 82 % de la envolvente." icon={<Gauge className="h-5 w-5" />} accent="bg-violet-500" />
            <MetricCard label="Presión media" value={pressureResultAvailable ? numberValue(telemetry.estimatedMapMmHg) : undefined} unit="mmHg" hint="Pico de la envolvente oscilométrica (MAP)." icon={<Activity className="h-5 w-5" />} accent="bg-blue-500" />
            <MetricCard label="Sensor / manguito" value={numberValue(telemetry.cuffPressureMmHg ?? raw.cuffPressureFilteredMmHg)} unit="mmHg" hint="Presión manométrica instantánea respecto al cero inicial." icon={<CircleDot className="h-5 w-5" />} accent="bg-cyan-500" />
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.55fr)]">
            <SignalChart title="Presión del manguito" data={slowHistory} lines={[
              { key: "cuff", label: "Manguito mmHg", color: "#06b6d4" },
              { key: "envelope", label: "Envolvente", color: "#f97316" },
              { key: "oscillation", label: "Oscilación", color: "#ec4899" },
            ]} />
            <Card className="border-slate-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/70">
              <CardContent className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-1">
                <Diagnostic label="Estado" value={String(telemetry.pressureState ?? "IDLE")} tone={telemetry.pressureState !== "IDLE" ? "good" : "normal"} />
                <Diagnostic label="ADC presión" value={format(raw.pressureRaw, 0)} />
                <Diagnostic label="Cero atmosférico" value={format(raw.pressureZeroRaw, 0)} />
                <Diagnostic label="Diferencia" value={`${format(raw.pressureDeltaCounts, 0)} cuentas`} />
                <Diagnostic label="Escala teórica" value={`${format(raw.pressureCountsPerMmHg, 1)} c/mmHg`} />
                <Diagnostic label="Presión sin filtrar" value={`${format(raw.cuffPressureRawMmHg, 2)} mmHg`} />
                <Diagnostic label="Oscilación" value={`${format(raw.pressureOscillationMmHg, 3)} mmHg`} />
                <Diagnostic label="Envolvente" value={`${format(raw.pressureOscillationEnvelope, 3)} mmHg`} />
                <Diagnostic label="Muestras oscilométricas" value={format(raw.pressureOscillationSampleCount, 0)} />
              </CardContent>
            </Card>
          </div>
        </section>

        <footer className="rounded-2xl border border-amber-300/60 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
          <strong>Calibración:</strong> el cero atmosférico elimina el offset inicial, pero la conversión a mmHg usa la sensibilidad nominal del fabricante. Para uso clínico todavía hace falta comparar el manguito contra un manómetro certificado y ajustar la escala.
        </footer>
      </div>
    </main>
  );
}
