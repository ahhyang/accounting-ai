import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import { Nav } from "./components/Nav";
import { AppChrome } from "./components/AppChrome";
import { Providers } from "./components/Providers";
import "./globals.css";

const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ui",
  display: "swap"
});

export const metadata: Metadata = {
  title: "AI Finance OS",
  description: "Client portal and accountant workspace for AI-assisted bookkeeping."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={plex.variable}>
        <Providers>
          <div className="app-shell">
            <Nav />
            <AppChrome />
            <div className="app-main">{children}</div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
