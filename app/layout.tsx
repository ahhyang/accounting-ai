import type { Metadata } from "next";
import { Nav } from "./components/Nav";
import { Providers } from "./components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Finance OS",
  description: "Client portal and accountant workspace for AI-assisted bookkeeping."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Nav />
          {children}
        </Providers>
      </body>
    </html>
  );
}
