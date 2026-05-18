import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, CalendarDays, HeartPulse, Waves } from "lucide-react";
import { SessionCharts } from "@/modules/Session/components/session-charts";
import { SessionsTable } from "@/modules/Session/components/session-table";
import type { Session } from "@/modules/Session/session.interface";
import { patientDashboardService } from "./patient-dashboard.service";

export default function PatientHistoryPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    (async () => {
      try {
        const data = await patientDashboardService.getSessions();
        setSessions(data);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const summary = useMemo(() => {
    const records = sessions.flatMap((s) => s.records ?? []);
    const avg = (vals: number[]) =>
      vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    return {
      sessions: sessions.length,
      records: records.length,
      avgPulse: avg(records.map((r) => r.pulse)).toFixed(0),
      avgSpo2: avg(records.map((r) => r.oxygenSaturation)).toFixed(0),
    };
  }, [sessions]);

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-sm bg-[radial-gradient(circle_at_top_right,_#eef2ff,_#eff6ff_50%,_#f8fafc)]">
        <CardHeader>
          <CardTitle className="text-2xl tracking-tight">Mi evolucion de salud</CardTitle>
          <CardDescription>
            Resumen didactico de tus sesiones previas y evolucion.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <Info title="Sesiones" value={summary.sessions} icon={<CalendarDays className="h-4 w-4" />} />
          <Info title="Lecturas" value={summary.records} icon={<Activity className="h-4 w-4" />} />
          <Info title="Promedio pulso" value={`${summary.avgPulse} bpm`} icon={<HeartPulse className="h-4 w-4" />} />
          <Info title="Promedio SpO2" value={`${summary.avgSpo2}%`} icon={<Waves className="h-4 w-4" />} />
        </CardContent>
      </Card>

      <Tabs defaultValue="charts">
        <TabsList className="grid w-full max-w-sm grid-cols-2 rounded-xl bg-muted/60 p-1">
          <TabsTrigger value="charts">Graficas</TabsTrigger>
          <TabsTrigger value="sessions">Sesiones</TabsTrigger>
        </TabsList>
        <TabsContent value="charts" className="mt-4">
          <SessionCharts sessions={sessions} />
        </TabsContent>
        <TabsContent value="sessions" className="mt-4">
          <SessionsTable
            sessions={sessions}
            isLoading={isLoading}
            page={page}
            pageSize={5}
            onPageChange={setPage}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Info({
  title,
  value,
  icon,
}: {
  title: string;
  value: string | number;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-muted/70 bg-card/80 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1.5">{icon}{title}</div>
      <div className="text-lg font-semibold tracking-tight">{value}</div>
    </div>
  );
}
