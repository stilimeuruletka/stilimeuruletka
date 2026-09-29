import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";
import TelegramInit from "./telegram-init";

const uncage = localFont({
  src: "../../UNCAGE-Regular.ttf",
  variable: "--font-uncage",
  display: "swap",
  weight: "400"
});

const uncageSemiBold = localFont({
  src: "../../public/UNCAGE-SemiBold.ttf",
  variable: "--font-uncage-semibold",
  display: "swap",
  weight: "600"
});

export const metadata: Metadata = {
  title: "Лотерея",
  description: "Колесо фортуны",
  other: {
    "apple-mobile-web-app-capable": "yes",
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
    "format-detection": "telephone=no"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#ffffff"
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={`${uncage.variable} ${uncageSemiBold.variable}`} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://telegram.org" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://t.me" />
      </head>
      <body>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" />
        <TelegramInit />
        {children}
      </body>
    </html>
  );
}
