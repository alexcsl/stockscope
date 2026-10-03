import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./research-ui.css";
import { FirebaseSession } from "@/components/firebase-session";
import { firebaseConfigured } from "@/lib/firebase-auth";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "StockScope | Research before action",
  description:
    "Research Stock Token identity, issuer context, venue observations, and action evidence in one workspace.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full"><FirebaseSession enabled={firebaseConfigured()} />{children}</body>
    </html>
  );
}
