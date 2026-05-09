import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "react-hot-toast";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Datastraw News Intelligence | AI Platform",
  description:
    "AI-powered news research platform with LangGraph agents, RAG chatbot, and real-time intelligence feeds.",
  keywords: ["news intelligence", "AI research", "LangGraph", "RAG", "news analysis"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${plusJakarta.variable}`}>
      <body className={inter.className}>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: "#1e293b",
              color: "#f1f5f9",
              border: "1px solid #334155",
              borderRadius: "12px",
              fontSize: "13px",
              fontWeight: "500",
            },
            success: {
              iconTheme: { primary: "#34d399", secondary: "#1e293b" },
            },
            error: {
              iconTheme: { primary: "#f87171", secondary: "#1e293b" },
            },
          }}
        />
      </body>
    </html>
  );
}
