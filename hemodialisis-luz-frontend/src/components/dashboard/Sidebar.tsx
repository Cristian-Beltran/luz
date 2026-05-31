// Sidebar.tsx — Modelo “RAIL” compacto/expandible (look totalmente distinto)

import type React from "react";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Home,
  UsersRound,
  User,
  Wifi,
  LogOut,
  Sun,
  Moon,
  Droplet,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "../../lib/utils";
import { useTheme } from "../../contexts/ThemeContext";
import { useAuthStore } from "@/auth/useAuth";

interface SidebarProps {
  isOpen: boolean; // móvil
  onClose: () => void; // móvil
}

const NAV_DOCTOR = [
  { name: "Panel médico", href: "/", icon: Home },
  { name: "Doctores", href: "/doctor", icon: UsersRound },
  { name: "Pacientes", href: "/patients", icon: User },
  { name: "Monitoreo en vivo", href: "/monitoring", icon: Wifi },
];

const NAV_PATIENT = [
  { name: "Mi estado", href: "/patient/dashboard", icon: Home },
  { name: "Mi evolución", href: "/patient/history", icon: Wifi },
];

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useTheme();
  const NAV = user?.type === "patient" ? NAV_PATIENT : NAV_DOCTOR;

  // Modo rail: colapsado/expandido en desktop (nada que ver con tu sidebar previo)
  const [expanded, setExpanded] = useState<boolean>(true);
  const showExpandedContent = expanded || isOpen;

  const handleLogout = () => {
    logout();
    onClose();
    navigate("/login");
  };

  // Estilo de fondo distinto (degradé + pattern sutil)
  const backgroundStyle: React.CSSProperties = {
    backgroundImage:
      "radial-gradient(1200px 1200px at -10% -10%, rgba(99,102,241,0.12), transparent 60%), radial-gradient(1200px 1200px at 110% 110%, rgba(34,197,94,0.10), transparent 60%), linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
  };

  return (
    <>
      {/* Overlay móvil */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      )}

      {/* Contenedor (desktop rail + móvil drawer) */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 h-dvh w-72 border-r border-border/60 shadow-md",
          "bg-sidebar/90 backdrop-blur supports-[backdrop-filter]:bg-sidebar/80",
          "transition-[transform,width] duration-300 ease-in-out",
          "md:sticky md:top-3 md:z-30 md:ml-3 md:my-3 md:h-[calc(100dvh-1.5rem)] md:shrink-0 md:rounded-2xl",
          // Desktop rail width
          showExpandedContent ? "md:w-72" : "md:w-20",
          // Mobile drawer
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
        style={backgroundStyle}
      >
        {/* Header brand + toggle */}
        <div
          className={cn(
            "relative flex items-center",
            showExpandedContent ? "px-4" : "px-2",
            "py-4",
          )}
        >
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 grid place-items-center rounded-xl bg-primary/15 text-primary">
              <Droplet className="h-4 w-4" />
            </div>
            {showExpandedContent && (
              <div className="leading-tight">
                <div className="text-sm font-semibold">Luz Clínica</div>
                <div className="text-[11px] text-muted-foreground">
                  Monitoreo hemodialítico
                </div>
              </div>
            )}
          </div>

          {/* Botón cerrar móvil */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="absolute right-2 top-2 md:hidden"
          >
            ✕
          </Button>

          {/* Toggle rail (solo desktop) */}
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto hidden md:inline-flex"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "Colapsar" : "Expandir"}
          >
            {expanded ? (
              <ChevronLeft className="h-5 w-5" />
            ) : (
              <ChevronRight className="h-5 w-5" />
            )}
          </Button>
        </div>

        {/* Nav */}
        <nav className="mt-2 px-2 space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={onClose}
                className={cn(
                  "group flex items-center rounded-xl transition-colors",
                  expanded ? "px-3 py-2.5" : "px-2.5 py-2",
                  active
                    ? "bg-primary/15 text-primary shadow-sm ring-1 ring-primary/20"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <span
                  className={cn(
                    "grid place-items-center rounded-lg",
                    "h-9 w-9 shrink-0",
                    active
                      ? "bg-primary/20"
                      : "bg-muted/40 group-hover:bg-muted/60",
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                {showExpandedContent && (
                  <span className="ml-3 text-sm font-medium truncate">
                    {item.name}
                  </span>
                )}
                {/* Indicador activo al borde derecho */}
                {active && (
                  <span className="ml-auto h-5 w-1.5 rounded-full bg-primary/70" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div
          className={cn(
            "absolute bottom-0 left-0 right-0 border-t border-border/60",
            showExpandedContent ? "px-3" : "px-2",
            "py-3",
          )}
        >
          {/* Usuario */}
          <div
            className={cn(
              "mb-2 flex items-center gap-3 rounded-xl bg-muted/40",
              showExpandedContent ? "px-3 py-2.5" : "px-2 py-2 justify-center",
            )}
          >
            <div className="h-9 w-9 grid place-items-center rounded-lg bg-primary text-primary-foreground">
              <span className="text-sm font-semibold">
                {(user?.fullname ?? "U")
                  .split(" ")
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </span>
            </div>
            {showExpandedContent && (
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {user?.fullname ?? "Usuario"}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  Sesión activa
                </p>
              </div>
            )}
          </div>

          {/* Acciones */}
          <div className={cn("", showExpandedContent ? "gap-2" : "flex-col gap-2")}>
            <Button
              variant="ghost"
              onClick={toggleTheme}
              className={cn(
                "justify-start rounded-xl",
                showExpandedContent ? "w-full px-3" : "w-full px-0 justify-center",
              )}
              title={theme === "light" ? "Modo oscuro" : "Modo claro"}
            >
              {theme === "light" ? (
                <Moon className="h-5 w-5" />
              ) : (
                <Sun className="h-5 w-5" />
              )}
              {showExpandedContent && (
                <span className="ml-2 text-sm">
                  {theme === "light" ? "Modo oscuro" : "Modo claro"}
                </span>
              )}
            </Button>

            <Button
              variant="ghost"
              onClick={handleLogout}
              className={cn(
                "justify-start text-destructive hover:bg-destructive/10 rounded-xl",
                showExpandedContent ? "w-full px-3" : "w-full px-0 justify-center",
              )}
              title="Cerrar sesión"
            >
              <LogOut className="h-5 w-5" />
              {showExpandedContent && <span className="ml-2 text-sm">Cerrar sesión</span>}
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
