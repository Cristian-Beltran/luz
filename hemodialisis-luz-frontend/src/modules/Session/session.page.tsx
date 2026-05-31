// src/pages/sessions/SessionPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Activity, HeartPulse, RotateCcw, Thermometer } from "lucide-react";
import { jsPDF } from "jspdf";

import { DashboardHeader } from "@/components/headerPage";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { sessionStore } from "./data/session.store";
import { SessionsTable } from "./components/session-table";
import { SessionCharts } from "./components/session-charts"; // ojo: charts (no chars)
import type { Session } from "./session.interface";

function safeISO(value?: string | Date | null): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : "";
}

function toCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value).replace(/"/g, '""');
  if (/[",\n]/.test(s)) return `"${s}"`;
  return s;
}

function buildCsvFromSessions(sessions: Session[]): string {
  const headers = [
    "sessionId",
    "sessionStartedAt",
    "sessionEndedAt",
    "patientId",
    "patientFullname",
    "recordId",
    "recordedAt",
    "pulse",
    "oxygenSaturation",
    "temperatureC",
    "systolic",
    "diastolic",
  ];
  const lines = [headers.map(toCsvCell).join(",")];

  sessions.forEach((s) => {
    (s.records ?? []).forEach((r) => {
      const row = [
        s.id,
        safeISO(s.startedAt),
        safeISO(s.endedAt ?? null),
        s.patient?.id ?? "",
        s.patient?.user?.fullname ?? "",
        r.id,
        safeISO(r.recordedAt),
        r.pulse,
        r.oxygenSaturation,
        r.temperatureC,
        r.systolic,
        r.diastolic,
      ];
      lines.push(row.map(toCsvCell).join(","));
    });
  });

  return lines.join("\n");
}

export default function SessionPage() {
  const { id: patientId } = useParams<{ id: string }>();

  const {
    sessions,
    isLoading, // boolean
    error, // string | null
    fetchByPatient, // (patientId: string) => Promise<void>
  } = sessionStore();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "closed">(
    "all",
  );
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const filteredSessions = useMemo(() => {
    const text = search.trim().toLowerCase();
    const fromTs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toTs = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : null;

    return sessions.filter((s) => {
      const ts = new Date(s.startedAt).getTime();
      const matchesText =
        !text ||
        s.id.toLowerCase().includes(text) ||
        (s.patient?.user?.fullname ?? "").toLowerCase().includes(text);

      const isActive = !s.endedAt;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && isActive) ||
        (statusFilter === "closed" && !isActive);

      const matchesFrom = fromTs == null || ts >= fromTs;
      const matchesTo = toTs == null || ts <= toTs;

      return matchesText && matchesStatus && matchesFrom && matchesTo;
    });
  }, [sessions, search, statusFilter, dateFrom, dateTo]);

  const clinicalSummary = useMemo(() => {
    const records = filteredSessions.flatMap((s) => s.records ?? []);
    const avg = (vals: number[]) =>
      vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;

    const pulse = records.map((r) => r.pulse).filter((v) => Number.isFinite(v));
    const spo2 = records
      .map((r) => r.oxygenSaturation)
      .filter((v) => Number.isFinite(v));
    const temp = records
      .map((r) => r.temperatureC)
      .filter((v) => Number.isFinite(v));

    return {
      sessionsCount: filteredSessions.length,
      recordsCount: records.length,
      avgPulse: avg(pulse),
      avgSpo2: avg(spo2),
      avgTemp: avg(temp),
    };
  }, [filteredSessions]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, dateFrom, dateTo]);

  const handleExportCsv = () => {
    const csv = buildCsvFromSessions(filteredSessions);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    a.href = url;
    a.download = `sesiones-filtradas-${ts}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = () => {
    const doc = new jsPDF();
    let y = 12;
    doc.setFontSize(14);
    doc.text("Reporte clinico de sesiones", 10, y);
    y += 8;
    doc.setFontSize(10);
    doc.text(`Sesiones filtradas: ${filteredSessions.length}`, 10, y);
    y += 6;
    doc.text(`Lecturas: ${clinicalSummary.recordsCount}`, 10, y);
    y += 8;

    filteredSessions.forEach((s) => {
      if (y > 270) {
        doc.addPage();
        y = 12;
      }
      doc.setFontSize(10);
      doc.text(
        `Sesion ${s.id.slice(0, 8)} | ${s.patient?.user?.fullname ?? "Paciente"} | Inicio ${new Date(s.startedAt).toLocaleString("es-ES")}`,
        10,
        y,
      );
      y += 5;
      const last = (s.records ?? []).at(-1);
      doc.text(
        `Ultimo: Pulso ${last?.pulse ?? "-"} | SpO2 ${last?.oxygenSaturation ?? "-"} | Temp ${last?.temperatureC ?? "-"} | PA ${last?.systolic ?? "-"}/${last?.diastolic ?? "-"}`,
        12,
        y,
      );
      y += 7;
    });

    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    doc.save(`sesiones-filtradas-${ts}.pdf`);
  };

  useEffect(() => {
    if (patientId) fetchByPatient(patientId);
  }, [patientId, fetchByPatient]);

  const onReload = () => {
    if (patientId) fetchByPatient(patientId);
  };

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="Sesiones del paciente"
        description="Registro de sesiones y métricas clínicas"
        actions={
          <Button
            size="icon"
            variant="outline"
            onClick={onReload}
            title="Recargar"
            disabled={isLoading}
          >
            <RotateCcw />
          </Button>
        }
      />

      <div className="space-y-6">
        <Card className="border-0 shadow-sm bg-[radial-gradient(circle_at_top_left,_#f0f9ff,_#f8fafc_50%,_#f5f3ff)]">
          <CardHeader>
            <CardTitle className="tracking-tight">Filtros globales</CardTitle>
            <CardDescription>
              Estos filtros aplican a graficas, tabla y exportaciones.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <input
              className="rounded-lg border bg-background px-3 py-2 sm:col-span-2"
              placeholder="Buscar por paciente o id de sesion"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="rounded-lg border bg-background px-3 py-2"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as "all" | "active" | "closed")
              }
            >
              <option value="all">Todas</option>
              <option value="active">Activas</option>
              <option value="closed">Cerradas</option>
            </select>
            <input
              type="date"
              className="rounded-lg border bg-background px-3 py-2"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
            <input
              type="date"
              className="rounded-lg border bg-background px-3 py-2"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
            <select
              className="rounded-lg border bg-background px-3 py-2"
              value={String(pageSize)}
              onChange={(e) => setPageSize(Number(e.target.value))}
            >
              <option value="5">5 por pagina</option>
              <option value="10">10 por pagina</option>
              <option value="20">20 por pagina</option>
            </select>
          </CardContent>
          <CardContent className="pt-0 flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleExportCsv}>
              Descargar CSV
            </Button>
            <Button variant="outline" onClick={handleExportPdf}>
              Descargar PDF
            </Button>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="animate-in fade-in slide-in-from-bottom-1 duration-500">
            <CardHeader>
              <CardDescription className="text-[11px] uppercase tracking-wide inline-flex items-center gap-1.5"><Activity className="h-3.5 w-3.5" />Sesiones clinicas</CardDescription>
              <CardTitle className="tracking-tight">{clinicalSummary.sessionsCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="animate-in fade-in slide-in-from-bottom-1 duration-500" style={{ animationDelay: "60ms" }}>
            <CardHeader>
              <CardDescription className="text-[11px] uppercase tracking-wide inline-flex items-center gap-1.5"><Activity className="h-3.5 w-3.5" />Lecturas acumuladas</CardDescription>
              <CardTitle className="tracking-tight">{clinicalSummary.recordsCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="animate-in fade-in slide-in-from-bottom-1 duration-500" style={{ animationDelay: "120ms" }}>
            <CardHeader>
              <CardDescription className="text-[11px] uppercase tracking-wide inline-flex items-center gap-1.5"><HeartPulse className="h-3.5 w-3.5" />Promedio Pulso / SpO2</CardDescription>
              <CardTitle className="tracking-tight">
                {clinicalSummary.avgPulse.toFixed(0)} bpm / {clinicalSummary.avgSpo2.toFixed(0)}%
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="animate-in fade-in slide-in-from-bottom-1 duration-500" style={{ animationDelay: "180ms" }}>
            <CardHeader>
              <CardDescription className="text-[11px] uppercase tracking-wide inline-flex items-center gap-1.5"><Thermometer className="h-3.5 w-3.5" />Promedio Temperatura</CardDescription>
              <CardTitle className="tracking-tight">{clinicalSummary.avgTemp.toFixed(1)} C</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {error && (
          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="text-destructive">Error</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
          </Card>
        )}

        <Tabs defaultValue="charts" className="w-full">
          <TabsList className="grid w-full grid-cols-2 rounded-xl bg-muted/60 p-1 sm:max-w-md">
            <TabsTrigger value="charts">Gráficas</TabsTrigger>
            <TabsTrigger value="table">Tabla de datos</TabsTrigger>
          </TabsList>

          <TabsContent value="charts" className="space-y-4">
            <SessionCharts sessions={filteredSessions} />
          </TabsContent>

          <TabsContent value="table">
            <Card>
              <CardHeader>
                <CardTitle>Datos detallados de sesiones</CardTitle>
                <CardDescription>
                  Todas las sesiones y registros del paciente
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SessionsTable
                  sessions={filteredSessions}
                  isLoading={isLoading}
                  page={page}
                  pageSize={pageSize}
                  onPageChange={setPage}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
