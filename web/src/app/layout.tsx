import type { Metadata } from "next";
import { Roboto, Rajdhani } from "next/font/google";
import { LanguageProvider } from "@/contexts/LanguageContext";
import UnifiedLayoutClient from "@/components/UnifiedLayoutClient";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { NotificationBar } from "@/components/NotificationBar";
import { ThemeProvider } from "@/contexts/ThemeContext";
import "./globals.css";

const roboto = Roboto({
  weight: ["300", "400", "500", "700", "900"],
  subsets: ["latin"],
  variable: "--font-roboto",
});

const rajdhani = Rajdhani({
  weight: ["600", "700"],
  subsets: ["latin"],
  variable: "--font-tech",
});

export const metadata: Metadata = {
  title: "ET⚡U.DE — Elektrotechnik, die verbindet",
  description: "ET4U.DE — Digitale Plattform für Elektrotechnik, Planung, Installation, Prüfung & Service",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ET⚡U.DE",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport = {
  themeColor: "#101114",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" data-theme="et4u" className="dark">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="ET⚡U.DE" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
      </head>
      <body className={`${roboto.variable} ${rajdhani.variable} font-sans transition-colors antialiased`}>
        <ThemeProvider attribute="data-theme" defaultTheme="deep-space" enableSystem={false}>
          <LanguageProvider>
            <NotificationProvider>
              <NotificationBar />
              <UnifiedLayoutClient>{children}</UnifiedLayoutClient>
            </NotificationProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
