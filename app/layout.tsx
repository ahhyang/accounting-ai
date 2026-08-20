import type { Metadata } from "next";
import { Nav } from "./components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Finance OS",
  description: "End-to-end accounting, tax, audit, finance and AI decision platform."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
