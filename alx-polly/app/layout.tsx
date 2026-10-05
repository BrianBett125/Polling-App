import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import MainNav from "@/components/main-nav";
import { AuthProvider } from "@/contexts/auth-context";
import { AuthStatus } from "@/components/auth-status";
import PollCreatedToast from "@/components/PollCreatedToast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ALX Polly",
  description: "Create polls, share them by link or QR code, and see the results.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
        <header className="border-b">
          <div className="container mx-auto flex min-h-14 flex-wrap items-center justify-between gap-2 px-4 py-2">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
              <span className="font-semibold">ALX Polly</span>
              <MainNav />
            </div>
            <div className="flex items-center gap-2">
              <AuthStatus />
            </div>
          </div>
        </header>
        <main className="container mx-auto p-4">{children}</main>
        <Suspense fallback={null}>
          <PollCreatedToast />
        </Suspense>
        </AuthProvider>
      </body>
    </html>
  );
}
