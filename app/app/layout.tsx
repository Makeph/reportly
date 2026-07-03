import "./globals.css";
import type { Metadata } from "next";

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
    <html lang="fr">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
