import type { ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { patientService } from "@/modules/Patient/data/patient.service";

const registerSchema = z.object({
  fullname: z.string().min(2, "Nombre requerido"),
  email: z.string().email("Correo invalido"),
  password: z.string().min(6, "Minimo 6 caracteres"),
  address: z.string().optional(),
  referenceName: z.string().min(2, "Nombre de referencia requerido"),
  age: z.number().min(0).max(120),
  sex: z.enum(["masculino", "femenino", "otro"]),
  patientType: z.enum(["nino", "adulto", "adulto_mayor"]),
  referencePhone: z.string().min(7, "Telefono requerido"),
  baseDisease: z.string().optional(),
  knownAllergies: z.string().optional(),
  hasDiabetes: z.boolean(),
  hasHypertension: z.boolean(),
  hasHeartDisease: z.boolean(),
  hasAnemia: z.boolean(),
  hasPreviousInfections: z.boolean(),
});

type RegisterValues = z.infer<typeof registerSchema>;

export default function PatientRegisterPage() {
  const navigate = useNavigate();
  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullname: "",
      email: "",
      password: "",
      address: "",
      referenceName: "",
      age: 0,
      sex: "masculino",
      patientType: "adulto",
      referencePhone: "",
      baseDisease: "",
      knownAllergies: "",
      hasDiabetes: false,
      hasHypertension: false,
      hasHeartDisease: false,
      hasAnemia: false,
      hasPreviousInfections: false,
    },
  });

  const onSubmit = async (values: RegisterValues) => {
    try {
      await patientService.register(values);
      toast.success("Cuenta creada. Ahora puedes iniciar sesion.");
      navigate("/login");
    } catch {
      toast.error("No se pudo crear la cuenta");
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(800px_500px_at_0%_0%,rgba(99,102,241,0.08),transparent_60%),radial-gradient(700px_500px_at_100%_100%,rgba(34,197,94,0.08),transparent_60%)] px-4 py-8">
      <div className="mx-auto max-w-4xl rounded-2xl border border-border/60 bg-card/80 p-6 shadow-xl backdrop-blur">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Crear cuenta para pacientes</h1>
          <p className="text-sm text-muted-foreground">
            Registro exclusivo para pacientes con sus datos clinicos iniciales.
          </p>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nombre del paciente" error={form.formState.errors.fullname?.message}>
              <Input {...form.register("fullname")} />
            </Field>
            <Field label="Correo" error={form.formState.errors.email?.message}>
              <Input type="email" {...form.register("email")} />
            </Field>
            <Field label="Contraseña" error={form.formState.errors.password?.message}>
              <Input type="password" {...form.register("password")} />
            </Field>
            <Field label="Direccion" error={form.formState.errors.address?.message}>
              <Input {...form.register("address")} />
            </Field>
            <Field label="Persona de referencia" error={form.formState.errors.referenceName?.message}>
              <Input {...form.register("referenceName")} />
            </Field>
            <Field label="Numero de referencia" error={form.formState.errors.referencePhone?.message}>
              <Input {...form.register("referencePhone")} />
            </Field>
            <Field label="Edad" error={form.formState.errors.age?.message}>
              <Input type="number" min="0" max="120" {...form.register("age", { valueAsNumber: true })} />
            </Field>
            <Field label="Sexo" error={form.formState.errors.sex?.message}>
              <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" {...form.register("sex")}>
                <option value="masculino">Masculino</option>
                <option value="femenino">Femenino</option>
                <option value="otro">Otro</option>
              </select>
            </Field>
            <Field label="Tipo de paciente" error={form.formState.errors.patientType?.message}>
              <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" {...form.register("patientType")}>
                <option value="nino">Niño</option>
                <option value="adulto">Adulto</option>
                <option value="adulto_mayor">Adulto mayor</option>
              </select>
            </Field>
            <Field label="Enfermedad de base" error={form.formState.errors.baseDisease?.message}>
              <Input {...form.register("baseDisease")} />
            </Field>
            <Field label="Alergias conocidas" error={form.formState.errors.knownAllergies?.message}>
              <Input {...form.register("knownAllergies")} />
            </Field>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">Antecedentes importantes</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["hasDiabetes", "Diabetes"],
                ["hasHypertension", "Hipertension"],
                ["hasHeartDisease", "Enfermedad cardiaca"],
                ["hasAnemia", "Anemia"],
                ["hasPreviousInfections", "Infecciones previas"],
              ].map(([name, label]) => (
                <label key={name} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <input type="checkbox" {...form.register(name as keyof RegisterValues)} />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={form.formState.isSubmitting}>Crear cuenta</Button>
            <Button type="button" variant="outline" onClick={() => navigate("/login")}>Volver al login</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      {children}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
