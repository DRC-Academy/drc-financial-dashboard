import type { Metadata } from "next";
import { Radio_Canada, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const radioCanada = Radio_Canada({
  variable: "--font-radio-canada",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "DRC Finanzas | Dashboard en vivo",
  description: "Métricas financieras de DRC Academy en tiempo real desde Google Sheets.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${radioCanada.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-drc-bg text-drc-ink">{children}</body>
    </html>
  );
}
