import { DashboardHeader } from "@/components/headerPage";
import TableDoctor from "./table/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlusCircle, RotateCcw } from "lucide-react";
import { userDoctorStore } from "./data/doctor.store";
import type { Doctor } from "./doctor.interface";
import { useEffect, useState } from "react";
import DoctorFormModal from "./modal-form";
import axios from "@/lib/axios";

type WhatsAppStatus = {
  status: "initializing" | "waiting_qr" | "connected" | "disconnected" | "error";
  qrDataUrl: string | null;
  currentUser: string | null;
  lastError: string | null;
  ready: boolean;
};

export default function DoctorPage() {
  const [selectedUser, setSelectedUser] = useState<Doctor | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [whatsApp, setWhatsApp] = useState<WhatsAppStatus | null>(null);
  const [whatsAppLoading, setWhatsAppLoading] = useState(false);
  const { fetchFull } = userDoctorStore();

  const loadWhatsAppStatus = async () => {
    try {
      const response = await axios.get<WhatsAppStatus>("/whatsapp/status");
      setWhatsApp(response.data);
    } catch {
      setWhatsApp(null);
    }
  };

  const restartWhatsApp = async () => {
    setWhatsAppLoading(true);
    try {
      await axios.post("/whatsapp/restart");
      await loadWhatsAppStatus();
    } finally {
      setWhatsAppLoading(false);
    }
  };

  useEffect(() => {
    void loadWhatsAppStatus();
    const timer = window.setInterval(() => {
      void loadWhatsAppStatus();
    }, 5000);

    return () => window.clearInterval(timer);
  }, []);

  const openForCreate = () => {
    setSelectedUser(null);
    setIsModalOpen(true);
  };

  const openForEdit = (user: Doctor) => {
    setSelectedUser(user);
    setIsModalOpen(true);
  };
  return (
    <div className="space-y-6">
      <DashboardHeader
        title="Doctores"
        description="Lista de doctores"
        actions={
          <>
            <Button onClick={openForCreate}>
              <PlusCircle />
              Crear
            </Button>
            <Button
              size={"icon"}
              variant="outline"
              onClick={fetchFull}
              title="Recargar"
            >
              <RotateCcw />
            </Button>
          </>
        }
      ></DashboardHeader>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Conexion de WhatsApp</CardTitle>
            <CardDescription>
              Escanea este QR con tu WhatsApp personal para habilitar el envio del PDF al cerrar la sesion.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
            <div className="rounded-xl border bg-muted/20 p-4">
              {whatsApp?.qrDataUrl ? (
                <img src={whatsApp.qrDataUrl} alt="QR de WhatsApp" className="mx-auto h-52 w-52 rounded-lg border bg-white p-2" />
              ) : (
                <div className="grid h-52 w-52 place-items-center rounded-lg border bg-background text-center text-sm text-muted-foreground">
                  {whatsApp?.ready
                    ? "Sesion enlazada"
                    : whatsApp?.status === "initializing"
                      ? "Inicializando cliente"
                      : "Esperando QR o reconexion"}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Info title="Estado" value={whatsApp?.status ?? "sin dato"} />
                <Info title="Conectado" value={whatsApp?.ready ? "Si" : "No"} />
                <Info title="Cuenta" value={whatsApp?.currentUser ?? "Sin enlazar"} />
                <Info title="Error" value={whatsApp?.lastError ?? "Sin errores"} />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void loadWhatsAppStatus()} disabled={whatsAppLoading}>
                  <RotateCcw className="mr-2" /> Actualizar estado
                </Button>
                <Button onClick={() => void restartWhatsApp()} disabled={whatsAppLoading}>
                  Reiniciar conexion QR
                </Button>
              </div>

              <p className="text-sm text-muted-foreground">
                El reporte se enviara automaticamente al numero de referencia del paciente cuando la sesion se cierre desde monitoreo.
              </p>
            </div>
          </CardContent>
        </Card>

        <TableDoctor onEdit={openForEdit} />
      </div>

      <DoctorFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        user={selectedUser}
      />
    </div>
  );
}

function Info({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="mt-1 break-all text-sm font-medium">{value}</div>
    </div>
  );
}
