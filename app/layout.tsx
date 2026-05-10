import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  title: "For You — Next Generation",
  description:
    "AI-native news interaction prototype. Summaries are assistive, not journalism.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={poppins.variable}>
      <body className="min-h-dvh font-sans antialiased">
        <Script
          src="https://js.puter.com/v2/"
          strategy="afterInteractive"
        />
        {children}
      </body>
    </html>
  );
}
