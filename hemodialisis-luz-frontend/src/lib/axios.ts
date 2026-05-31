import type { InternalAxiosRequestConfig } from "axios";
import axios from "axios";
import Cookies from "js-cookie";
//import Cookies from "js-cookie";

const getApiUrl = () => {
  const configuredUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (configuredUrl) return configuredUrl;

  if (typeof window === "undefined") return "http://localhost:3000";

  const protocol = window.location.protocol === "https:" ? "https:" : "http:";
  return `${protocol}//${window.location.hostname}:3000`;
};

const API_URL = getApiUrl();
const instance = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

instance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = Cookies.get("auth_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ✅ Nuevo interceptor de respuesta para manejar 401
instance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expirado o inválido
      Cookies.remove("auth_token");
      Cookies.remove("auth_type");
      Cookies.remove("auth_user");

      // Solo redirigir si está en una ruta protegida
      const currentPath = window.location.pathname;
      if (
        currentPath.startsWith("/clinic") ||
        currentPath.startsWith("/patient") ||
        currentPath.startsWith("/external")
      ) {
        window.location.href = "/";
      }
    }
    return Promise.reject(error);
  },
);

export default instance;
