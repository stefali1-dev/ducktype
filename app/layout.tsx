import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const mono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ducktype",
  description: "A typing trainer for real Python code.",
  icons: "/duck.svg",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#1c1c1e" },
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={mono.variable}>
      <body>{children}</body>
    </html>
  );
}
