import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import MainNav from "@/components/main-nav";
import { AuthProvider } from "@/contexts/auth-context";
import { AuthStatus } from "@/components/auth-status";

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
  description: "A simple polling app",
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
          <div className="container mx-auto flex h-14 items-center justify-between px-4">
            <div className="flex items-center gap-6">
              <span className="font-semibold">ALX Polly</span>
              <MainNav />
            </div>
            <div className="flex items-center gap-2">
              <AuthStatus />
            </div>
          </div>
        </header>
        <main className="container mx-auto p-4">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
