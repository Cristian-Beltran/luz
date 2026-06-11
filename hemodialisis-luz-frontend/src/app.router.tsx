import { createBrowserRouter } from "react-router-dom";
import { Navigate } from "react-router-dom";
import DashboardLayout from "./layouts/dashboard";
import DashboardPage from "./modules/Dashboard/dashboard-page";
import LoginPage from "./pages/login";
import PatientRegisterPage from "./pages/patient-register";
import NotFoundPage from "./pages/not-found";
import MonitoringPage from "./modules/Monitoring/monitoring";
import PublicMonitoringPage from "./modules/Monitoring/public-monitoring";
import DoctorsPage from "./modules/Doctors/doctors";
import { AuthProvider } from "./auth/ProtectedRoute";
import PatientPage from "./modules/Patient/patient";
import SessionPage from "./modules/Session/session.page";
import PatientDashboardPage from "./modules/PatientDashboard/patient-dashboard.page";
import PatientHistoryPage from "./modules/PatientDashboard/patient-history.page";
import { useAuthStore } from "./auth/useAuth";

function RoleHome() {
  const { user } = useAuthStore();
  if (user?.type === "patient") {
    return <Navigate to="/patient/dashboard" replace />;
  }
  return <DashboardPage />;
}

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/register/patient", element: <PatientRegisterPage /> },
  { path: "/public/monitoring", element: <PublicMonitoringPage /> },
  {
    path: "/",
    element: (
      <AuthProvider>
        <DashboardLayout />
      </AuthProvider>
    ),
    children: [
      { index: true, element: <RoleHome /> },
      { path: "monitoring", element: <MonitoringPage /> },
      { path: "doctor", element: <DoctorsPage /> },
      { path: "patients", element: <PatientPage /> },
      { path: "session/:id", element: <SessionPage /> },
      { path: "patient/dashboard", element: <PatientDashboardPage /> },
      { path: "patient/history", element: <PatientHistoryPage /> },
      // routes
    ],
  },
  { path: "*", element: <NotFoundPage /> },
]);
