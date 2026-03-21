import type { Metadata } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";

const uncage = localFont({
  src: "../../UNCAGE-Regular.ttf",
  variable: "--font-uncage"
});

export const metadata: Metadata = {
  title: "Лотерея",
  description: "Колесо фортуны"
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={uncage.variable} suppressHydrationWarning>
      <body>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}
