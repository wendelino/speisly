import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import Footer from "@/components/layout/footer";
import { FilterProvider } from "@/contexts/filter-context";
import ToastProvider from "@/lnio/components/toast/provider";
import "./globals.css";
import { AlertProvider } from "@/lnio/components/alert";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://speisly.de"),
  title: {
    default: "Speisly",
    template: "%s | Speisly",
  },
  description:
    "Aktuelle Speisepläne der Mensen der Martin-Luther-Universität Halle-Wittenberg",
  keywords: [
    "Speiseplan",
    "Mensa",
    "MLU",
    "Halle",
    "Mensen",
    "Essen",
    "Speisly",
  ],
  authors: [{ name: "Speisly" }],
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Speisly",
  },
  openGraph: {
    title: "Speisly",
    description:
      "Aktuelle Speisepläne der Mensen der Martin-Luther-Universität Halle-Wittenberg",
    type: "website",
    images: [
      {
        url: "/logo_512.png",
        width: 512,
        height: 512,
        alt: "Speisly Logo",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Speisly",
    description:
      "Aktuelle Speisepläne der Mensen der Martin-Luther-Universität Halle-Wittenberg",
    images: ["/logo_512.png"],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isProduction = process.env.NODE_ENV !== "development";

  return (
    <html lang="de">
      {isProduction ? (
        <head>
          <Script
            data-website-id="d6c44311-0001-4b07-a1c0-75bee4883fb1"
            defer
            src="https://stats.speisly.de/script.js"
          />
        </head>
      ) : null}
      <body
        className={`${geistSans.variable} ${geistMono.variable} relative flex min-h-screen flex-col antialiased`}
      >
        <FilterProvider>
          <AlertProvider>{children}</AlertProvider>
        </FilterProvider>
        <div className="flex-1" />
        <Footer />

        <ToastProvider position="top-right" />
      </body>
    </html>
  );
}
