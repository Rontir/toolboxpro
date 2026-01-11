import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import PWARegister from "@/components/PWARegister";
import { Providers } from "@/components/Providers";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ToolBox Pro - Multi-Tool dla E-commerce",
  description: "Profesjonalne narzędzia do konwersji obrazów, kadrowania produktów, dzielenia plików Excel i pobierania zdjęć. Zwiększ produktywność w e-commerce!",
  keywords: ["e-commerce", "narzędzia", "konwerter obrazów", "excel", "produkty", "allegro", "shopify"],
  authors: [{ name: "ToolBox Pro Team" }],
  creator: "ToolBox Pro",
  manifest: "/manifest.json",
  themeColor: "#10b981",

  // Open Graph
  openGraph: {
    type: "website",
    locale: "pl_PL",
    url: "https://toolboxpro.app",
    siteName: "ToolBox Pro",
    title: "ToolBox Pro - Multi-Tool dla E-commerce",
    description: "Profesjonalne narzędzia do konwersji obrazów, kadrowania produktów, dzielenia plików Excel i pobierania zdjęć.",
    images: [
      {
        url: "/icon-512.png",
        width: 512,
        height: 512,
        alt: "ToolBox Pro Logo",
      },
    ],
  },

  // Twitter Card
  twitter: {
    card: "summary_large_image",
    title: "ToolBox Pro - Multi-Tool dla E-commerce",
    description: "Profesjonalne narzędzia do konwersji obrazów, kadrowania produktów, dzielenia plików Excel.",
    images: ["/icon-512.png"],
  },

  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ToolBox Pro",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },

  // Robots
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`} suppressHydrationWarning>
        <Providers>
          <ErrorBoundary>
            <PWARegister />
            {children}
          </ErrorBoundary>
        </Providers>
      </body>
    </html>
  );
}

