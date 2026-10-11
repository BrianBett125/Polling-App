import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import MainNav from "@/components/main-nav";
import { AuthProvider } from "@/contexts/auth-context";
import { AuthStatus } from "@/components/auth-status";
import PollCreatedToast from "@/components/PollCreatedToast";
import SkipLink from "@/components/SkipLink";
import ThemeToggle from "@/components/ThemeToggle";
import { Analytics } from "@vercel/analytics/next";
import { resolveSiteUrl, SITE_NAME } from "@/lib/seo";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const description = "Create polls, share them by link or QR code, and see the results.";

export const metadata: Metadata = {
  // Makes relative Open Graph / Twitter image URLs absolute. NEXT_PUBLIC_SITE_URL, else the Vercel
  // production host, else localhost.
  metadataBase: new URL(resolveSiteUrl()),
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  description,
  openGraph: { type: "website", siteName: SITE_NAME, title: SITE_NAME, description },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Static string from lib/theme.ts, no user input: sets the theme class before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SkipLink />
        <AuthProvider>
        <header className="border-b">
          <div className="container mx-auto flex min-h-14 flex-wrap items-center justify-between gap-2 px-4 py-2">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
              <span className="font-semibold">ALX Polly</span>
              <MainNav />
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <AuthStatus />
            </div>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="container mx-auto p-4 focus:outline-none">
          {children}
        </main>
        <Suspense fallback={null}>
          <PollCreatedToast />
        </Suspense>
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
