import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Staff Chief",
  description: "Seu segundo cérebro gerencial, local e sob seu controle.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
