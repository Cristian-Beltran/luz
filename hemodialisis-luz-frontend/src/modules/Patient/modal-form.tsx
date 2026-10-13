import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import type { Patient } from "./patient.interface";
import { userPatientStore } from "./data/patient.store";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  user: Patient | null;
}

export default function PatientFormModal({ isOpen, onClose, user }: Props) {
  const patientSchema = z.object({
    fullname: z.string().min(2, "Nombre requerido"),
    email: z.string().email("Correo requerido"),
    password: z.string().optional(),
    address: z.string().optional(),
    referenceName: z.string().min(2, "Nombre de referencia requerido"),
    age: z.coerce.number().min(0, "Edad inválida").max(120, "Edad inválida"),
    sex: z.enum(["masculino", "femenino", "otro"]),
    patientType: z.enum(["nino", "adulto", "adulto_mayor"]),
    referencePhone: z.string().min(7, "Telefono requerido"),
    dialysisDays: z.array(z.number()).min(1, "Selecciona al menos un día"),
    dialysisStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida").optional().or(z.literal("")),
    sessionDurationMinutes: z.coerce.number().min(30).max(600),
    baseDisease: z.string().optional(),
    knownAllergies: z.string().optional(),
    hasDiabetes: z.boolean(),
    hasHypertension: z.boolean(),
    hasHeartDisease: z.boolean(),
    hasAnemia: z.boolean(),
    hasPreviousInfections: z.boolean(),
  });

  type PatientFormValues = z.infer<typeof patientSchema>;

  const { create, update } = userPatientStore();
  const form = useForm<PatientFormValues>({
    resolver: zodResolver(patientSchema) as any,
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
      dialysisDays: [1, 3, 5],
      dialysisStartTime: "07:00",
      sessionDurationMinutes: 240,
      baseDisease: "",
      knownAllergies: "",
      hasDiabetes: false,
      hasHypertension: false,
      hasHeartDisease: false,
      hasAnemia: false,
      hasPreviousInfections: false,
    },
  });

  useEffect(() => {
    if (user) {
      form.reset({
        fullname: user.user.fullname,
        email: user.user.email,
        password: "",
        address: user.user.address || "",
        referenceName: user.referenceName,
        age: user.age,
        sex: user.sex,
        patientType: user.patientType,
        referencePhone: user.referencePhone,
        dialysisDays: user.dialysisDays || [1, 3, 5],
        dialysisStartTime: user.dialysisStartTime || "07:00",
        sessionDurationMinutes: user.sessionDurationMinutes || 240,
        baseDisease: user.baseDisease || "",
        knownAllergies: user.knownAllergies || "",
        hasDiabetes: user.hasDiabetes,
        hasHypertension: user.hasHypertension,
        hasHeartDisease: user.hasHeartDisease,
        hasAnemia: user.hasAnemia,
        hasPreviousInfections: user.hasPreviousInfections,
      });
      return;
    }

    form.reset({
      fullname: "",
      email: "",
      password: "",
      address: "",
      referenceName: "",
      age: 0,
      sex: "masculino",
      patientType: "adulto",
      referencePhone: "",
      dialysisDays: [1, 3, 5],
      dialysisStartTime: "07:00",
      sessionDurationMinutes: 240,
      baseDisease: "",
      knownAllergies: "",
      hasDiabetes: false,
      hasHypertension: false,
      hasHeartDisease: false,
      hasAnemia: false,
      hasPreviousInfections: false,
    });
  }, [form, isOpen, user]);

  const onSubmit = async (data: PatientFormValues) => {
    try {
      if (user) {
        await update(user.user.id, data);
      } else {
        await create(data);
      }
      onClose();
    } catch (error) {
      if (!axios.isAxiosError(error)) {
        toast.error("Ha ocurrido un error");
        return;
      }
      if (error.response?.status === 400) {
        toast.error("Correo repetido");
        form.setError("email", { type: "server" }, { shouldFocus: true });
        return;
      }
      toast.error(error.response?.data.message);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{user ? "Editar paciente" : "Crear paciente"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit as any)} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <TextField control={form.control} name="fullname" label="Nombre del paciente" />
              <TextField control={form.control} name="email" label="Correo electronico" type="email" />
              {!user ? (
                <p className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground md:col-span-2">
                  Se asignará la contraseña temporal configurada para pacientes. El paciente deberá cambiarla al ingresar a la app.
                </p>
              ) : null}
              <TextField control={form.control} name="address" label="Direccion" />
              <TextField control={form.control} name="referenceName" label="Persona de referencia" />
              <TextField control={form.control} name="referencePhone" label="Numero de referencia" />
              <TextField control={form.control} name="dialysisStartTime" label="Hora de diálisis" type="time" />
              <TextField control={form.control} name="sessionDurationMinutes" label="Duración (minutos)" type="number" />
              <TextField control={form.control} name="age" label="Edad" type="number" />
              <SelectField
                control={form.control}
                name="sex"
                label="Sexo"
                options={[
                  { value: "masculino", label: "Masculino" },
                  { value: "femenino", label: "Femenino" },
                  { value: "otro", label: "Otro" },
                ]}
              />
              <SelectField
                control={form.control}
                name="patientType"
                label="Tipo de paciente"
                options={[
                  { value: "nino", label: "Niño" },
                  { value: "adulto", label: "Adulto" },
                  { value: "adulto_mayor", label: "Adulto mayor" },
                ]}
              />
              <TextField control={form.control} name="baseDisease" label="Enfermedad de base" />
              <TextField control={form.control} name="knownAllergies" label="Alergias conocidas" />
            </div>
            <DialysisDaysField control={form.control} />

            <div className="space-y-3">
              <p className="text-sm font-medium">Antecedentes importantes</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <CheckboxField control={form.control} name="hasDiabetes" label="Diabetes" />
                <CheckboxField control={form.control} name="hasHypertension" label="Hipertension" />
                <CheckboxField control={form.control} name="hasHeartDisease" label="Enfermedad cardiaca" />
                <CheckboxField control={form.control} name="hasAnemia" label="Anemia" />
                <CheckboxField control={form.control} name="hasPreviousInfections" label="Infecciones previas" />
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {user ? "Guardar cambios" : "Crear"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function TextField({
  control,
  name,
  label,
  type,
}: {
  control: any;
  name: any;
  label: string;
  type?: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input type={type} {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function SelectField({
  control,
  name,
  label,
  options,
}: {
  control: any;
  name: any;
  label: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              {...field}
            >
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function CheckboxField({
  control,
  name,
  label,
}: {
  control: any;
  name: any;
  label: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(field.value)}
              onChange={(event) => field.onChange(event.target.checked)}
            />
            {label}
          </label>
        </FormItem>
      )}
    />
  );
}

function DialysisDaysField({ control }: { control: any }) {
  const days = [
    [1, "Lun"], [2, "Mar"], [3, "Mié"], [4, "Jue"], [5, "Vie"], [6, "Sáb"], [0, "Dom"],
  ] as const;
  return (
    <FormField control={control} name="dialysisDays" render={({ field }) => (
      <FormItem>
        <FormLabel>Días de diálisis</FormLabel>
        <div className="flex flex-wrap gap-2">
          {days.map(([value, label]) => {
            const selected = (field.value || []).includes(value);
            return <Button key={value} type="button" variant={selected ? "default" : "outline"} size="sm" onClick={() => field.onChange(selected ? field.value.filter((day: number) => day !== value) : [...field.value, value])}>{label}</Button>;
          })}
        </div>
        <FormMessage />
      </FormItem>
    )} />
  );
}
