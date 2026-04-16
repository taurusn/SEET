import type { Metadata } from "next";
import { AdminAuthProvider } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "SEET Admin",
  description: "SEET Admin Portal — Shop management & onboarding",
  icons: {
    icon: "/admin/seet-mark.png",
    apple: "/admin/seet-mark.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" dir="ltr">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AdminAuthProvider>{children}</AdminAuthProvider>
      </body>
    </html>
  );
}
