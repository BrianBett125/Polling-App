import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import MainNav from "@/components/main-nav";
import { Logo } from "@/components/Logo";
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

// Display face for headings and the wordmark. Self-hosted by next/font, so the CSP needs nothing extra.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  display: "swap",
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
        className={`${geistSans.variable} ${geistMono.variable} ${bricolage.variable} flex min-h-screen flex-col antialiased`}
      >
        <SkipLink />
        <AuthProvider>
        <header className="glass sticky top-0 z-40 border-b border-border/60">
          <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 sm:px-6">
            <Link href="/" aria-label="ALX Polly home" className="order-1 rounded-lg">
              <Logo />
            </Link>
            <div className="order-3 -mx-1 w-full sm:order-2 sm:mx-0 sm:w-auto">
              <MainNav />
            </div>
            <div className="order-2 ml-auto flex items-center gap-2 sm:order-3 sm:gap-3">
              <ThemeToggle />
              <AuthStatus />
            </div>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 focus:outline-none sm:px-6 sm:py-12">
          {children}
        </main>
        <footer className="border-t border-border/60">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:px-6">
            <p>ALX Polly. Polls you can share with a link or a QR code.</p>
            <nav aria-label="Footer" className="flex gap-4">
              <Link href="/polls/new" className="hover:text-foreground">Create a poll</Link>
              <Link href="/polls" className="hover:text-foreground">My polls</Link>
            </nav>
          </div>
        </footer>
        <Suspense fallback={null}>
          <PollCreatedToast />
        </Suspense>
        </AuthProvider>
        {process.env.NEXT_PUBLIC_VERCEL_ANALYTICS === "1" && <Analytics />}
      </body>
    </html>
  );
}
