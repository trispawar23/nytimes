import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

/**
 * iOS Safari handles `dvh` correctly only when the viewport is configured for
 * full-screen; `viewportFit: "cover"` + `black-translucent` lets safe-area-inset
 * env() vars resolve to the notch / home indicator sizes.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  applicationName: "For You",
  title: "For You — Next Generation",
  description:
    "AI-native news interaction prototype. Summaries are assistive, not journalism.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "For You",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={poppins.variable}>
      <body className="min-h-dvh overflow-x-hidden font-sans antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
