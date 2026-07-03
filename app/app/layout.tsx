import "./globals.css";
import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Inter, Fira_Code } from "next/font/google";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const fira = Fira_Code({ subsets: ["latin"], variable: "--font-fira" });

export const metadata: Metadata = {
  title: "Reportly — espace agence",
  description: "Le registre de décisions des agences SEO · Ads · Growth",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={`${jakarta.variable} ${inter.variable} ${fira.variable}`}>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
