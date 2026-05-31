import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Droplets, HeartPulse, Thermometer } from "lucide-react";
import { ClinicalMetricCard } from "@/components/clinical/clinical-ui";
import {
  diastolicState,
  pulseState,
  spo2State,
  systolicState,
  tempState,
} from "@/components/clinical/clinical-ranges";
import { patientDashboardService, type PatientOwnStatus } from "./patient-dashboard.service";

export default function PatientDashboardPage() {
  const [status, setStatus] = useState<PatientOwnStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await patientDashboardService.getStatus();
        setStatus(res);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const labels = useMemo(() => {
    const alert = Boolean(status?.latestRecord?.alertActive);
    const warning = Boolean(status?.latestRecord?.warningActive);
    if (alert) return { text: "Alerta", variant: "destructive" as const };
    if (warning) return { text: "Vigilancia", variant: "secondary" as const };
    return { text: "Estable", variant: "outline" as const };
  }, [status]);

  if (loading) return <p>Cargando estado del paciente...</p>;

  const r = status?.latestRecord;

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-sm bg-[radial-gradient(circle_at_top_left,_#ecfeff,_#f0f9ff_40%,_#eef2ff)]">
        <CardHeader>
          <CardTitle className="text-2xl tracking-tight">Mi estado actual</CardTitle>
          <CardDescription>
            Estado basado en tus sesiones y lecturas recientes.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Badge variant={status?.inTreatment ? "default" : "secondary"}>
            {status?.inTreatment ? "Actualmente en tratamiento" : "Sin tratamiento activo"}
          </Badge>
          <Badge variant={labels.variant}>Estado clinico: {labels.text}</Badge>
          <Badge variant="outline">
            Ultima lectura: {r?.recordedAt ? new Date(r.recordedAt).toLocaleString("es-ES") : "Sin datos"}
          </Badge>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <ClinicalMetricCard
          title="Pulso"
          icon={<HeartPulse className="h-3.5 w-3.5" />}
          value={r?.pulse}
          unit="bpm"
          state={pulseState(r?.pulse)}
          hint="Frecuencia cardiaca"
          delay={0}
        />
        <ClinicalMetricCard
          title="SpO2"
          icon={<Droplets className="h-3.5 w-3.5" />}
          value={r?.oxygenSaturation}
          unit="%"
          state={spo2State(r?.oxygenSaturation)}
          hint="Saturacion de oxigeno"
          delay={40}
        />
        <ClinicalMetricCard
          title="Temperatura"
          icon={<Thermometer className="h-3.5 w-3.5" />}
          value={r?.temperatureC}
          unit="C"
          state={tempState(r?.temperatureC)}
          hint="Temperatura corporal"
          delay={80}
        />
        <ClinicalMetricCard
          title="Sistolica"
          icon={<Activity className="h-3.5 w-3.5" />}
          value={r?.systolic}
          unit="mmHg"
          state={systolicState(r?.systolic)}
          hint="Presion sistolica"
          delay={120}
        />
        <ClinicalMetricCard
          title="Diastolica"
          icon={<Activity className="h-3.5 w-3.5" />}
          value={r?.diastolic}
          unit="mmHg"
          state={diastolicState(r?.diastolic)}
          hint="Presion diastolica"
          delay={160}
        />
      </div>

      <Card className="border-dashed bg-card/60">
        <CardHeader>
          <CardTitle>Indicaciones simples</CardTitle>
          <CardDescription>Resumen didactico de tu estado actual.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm leading-relaxed">
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700">Si tu estado esta en alerta, avisa a tu medico inmediatamente.</p>
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700">Si estas en vigilancia, mantente en reposo y sigue indicaciones.</p>
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700">Si estas estable, continua con tu plan de tratamiento.</p>
        </CardContent>
      </Card>
    </div>
  );
}
