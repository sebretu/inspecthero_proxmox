import type { Metadata } from "next";

import { Geist, Geist_Mono } from "next/font/google";
import { LanguageProvider } from "@/contexts/LanguageContext";
import UnifiedLayoutClient from "@/components/UnifiedLayoutClient";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { NotificationBar } from "@/components/NotificationBar";
import { ThemeProvider } from "@/contexts/ThemeContext";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});


export const metadata: Metadata = {
  title: "Task Manager - Professional Task & Project Management",
  description: "Manage projects and tasks efficiently with offline support",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Task Manager",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport = {
  themeColor: "#667eea",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Task Manager" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} transition-colors`}>
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
