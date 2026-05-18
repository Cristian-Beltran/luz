import type { User } from "@/types/user.interface";

export interface Patient {
  id: string;
  user: User;
}

export interface CreatePatient {
  fullname: string;
  email: string;
  password?: string;
  address?: string;
  deviceId?: string;
}
