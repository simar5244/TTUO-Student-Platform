import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Tracker } from "@/components/Tracker";

export const metadata: Metadata = {
  title: "TTU Online Portal",
  description: "Texas Tech Online — admissions portal",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        {children}
        <Tracker />
      </body>
    </html>
  );
}
