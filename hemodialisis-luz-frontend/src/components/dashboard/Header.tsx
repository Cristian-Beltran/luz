import React from "react";
import { Droplet, Menu, HeartPulse, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/auth/useAuth";

interface HeaderProps {
  onMenuClick: () => void;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const { user } = useAuthStore();

  const initials = React.useMemo(() => {
    const name = user?.fullname ?? "Usuario";
    const parts = name.trim().split(" ");
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (
      parts[0].charAt(0) + parts[parts.length - 1].charAt(0)
    ).toUpperCase();
  }, [user?.fullname]);

  return (
    <header className="sticky top-0 z-20 border-b bg-background/95 shadow-sm">
      {/* Banda superior sutil (diferente al header anterior) */}
      <div className="h-1 w-full bg-gradient-to-r from-primary via-secondary to-primary/60" />

      {/* Contenido principal con layout centrado */}
      <div className="backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto max-w-7xl px-3 py-3 sm:px-4 lg:px-6">
          <div className="grid grid-cols-[auto,minmax(0,1fr),auto] items-center gap-3">
            {/* Izquierda: botón menú (mobile) */}
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="icon"
                onClick={onMenuClick}
                className="md:hidden"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </div>

            {/* Centro: branding (totalmente distinto) */}
            <div className="min-w-0 text-center md:text-left">
              <div className="inline-flex max-w-full items-center gap-2">
                <div className="h-8 w-8 rounded-lg grid place-items-center bg-primary/10 text-primary">
                  <Droplet className="h-4 w-4" />
                </div>
                <h1 className="truncate text-sm font-semibold tracking-tight sm:text-base lg:text-lg">
                  HemoSense · Multisensor No Invasivo
                </h1>
              </div>
              <p className="mx-auto mt-1 max-w-xl truncate text-xs text-muted-foreground md:mx-0">
                Monitoreo integral de parámetros sanguíneos (SpO₂, Hb estimada,
                FC, PI, variabilidad)
              </p>
            </div>

            {/* Derecha: usuario compacto */}
            <div className="flex items-center justify-end gap-3">
              <div className="hidden sm:flex items-center gap-2">
                <div className="h-9 w-9 rounded-md bg-primary text-primary-foreground grid place-items-center">
                  <span className="text-sm font-semibold">{initials}</span>
                </div>
                <div className="leading-tight hidden md:block">
                  <p className="text-sm font-medium">
                    {user?.fullname ?? "Usuario"}
                  </p>
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Sesión segura
                  </span>
                </div>
              </div>
              <div className="hidden md:inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
                <HeartPulse className="h-3.5 w-3.5" />
                Live
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
