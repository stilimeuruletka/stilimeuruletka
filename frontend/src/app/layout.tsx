import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";

const uncage = localFont({
  src: "../../UNCAGE-Regular.ttf",
  variable: "--font-uncage"
});

const uncageSemiBold = localFont({
  src: "../../public/UNCAGE-SemiBold.ttf",
  variable: "--font-uncage-semibold"
});

export const metadata: Metadata = {
  title: "Лотерея",
  description: "Колесо фортуны"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover"
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={`${uncage.variable} ${uncageSemiBold.variable}`} suppressHydrationWarning>
      <body>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <div className="appViewport">
          <div className="appCanvas">{children}</div>
        </div>
      </body>
    </html>
  );
}
