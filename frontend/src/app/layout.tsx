import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { Toaster } from "react-hot-toast";

export const metadata: Metadata = {
  title: "FinPilot AI — UAE Accounting",
  description: "Modern accounting software for UAE small businesses",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-bg-primary text-text-primary">
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "#161828",
              color: "#F1F5F9",
              border: "1px solid #1E2235",
              fontSize: "13px",
            },
            success: { iconTheme: { primary: "#10B981", secondary: "#161828" } },
            error: { iconTheme: { primary: "#EF4444", secondary: "#161828" } },
          }}
        />
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 ml-60 overflow-y-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
