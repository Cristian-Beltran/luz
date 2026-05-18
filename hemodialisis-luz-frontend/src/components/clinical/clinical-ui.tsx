import type { ReactNode } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { stateClass, stateLabel, type ClinicalState } from "./clinical-ranges";

export function ClinicalStatusBadge({ state }: { state: ClinicalState }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium",
        stateClass(state),
      )}
    >
      {stateLabel(state)}
    </span>
  );
}

export function ClinicalMetricCard({
  title,
  icon,
  value,
  unit,
  state,
  hint,
  delay = 0,
}: {
  title: string;
  icon: ReactNode;
  value?: number;
  unit: string;
  state: ClinicalState;
  hint: string;
  delay?: number;
}) {
  return (
    <Card
      className="bg-card/80 border-muted/70 animate-in fade-in slide-in-from-bottom-1 duration-500"
      style={{ animationDelay: `${delay}ms` }}
    >
      <CardHeader className="pb-3">
        <CardDescription className="flex items-center justify-between text-[11px] uppercase tracking-wide">
          <span className="inline-flex items-center gap-1.5">
            {icon}
            {title}
          </span>
          <ClinicalStatusBadge state={state} />
        </CardDescription>
        <CardTitle className="text-2xl tracking-tight transition-colors duration-200">
          {typeof value === "number" ? value.toFixed(1) : "-"}{" "}
          <span className="text-sm font-normal text-muted-foreground">{unit}</span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardHeader>
    </Card>
  );
}
