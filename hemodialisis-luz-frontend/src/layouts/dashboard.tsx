import type React from "react";
import { useState } from "react";
import BaseLayout from "./base";
import Header from "@/components/dashboard/Header";
import Sidebar from "@/components/dashboard/Sidebar";
import { Outlet } from "react-router-dom";

const DashboardLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <BaseLayout showThemeToggle={false}>
      <div className="flex min-h-dvh bg-background">
        {/* Sidebar */}
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* Main Content */}
        <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
          {/* Header */}
          <Header onMenuClick={() => setSidebarOpen(true)} />

          {/* Page Content */}
          <main className="min-w-0 flex-1 bg-muted/30 px-3 py-4 sm:px-4 md:px-5 lg:px-6">
            <div className="mx-auto w-full max-w-7xl">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </BaseLayout>
  );
};

export default DashboardLayout;
