import type { Metadata } from "next";
import { Anuphan } from "next/font/google";
import "./globals.css";
import AppProviders from "./components/AppProviders";

// ✅ ใช้ Anuphan เป็นฟอนต์หลักสำหรับทั้งแอป (รองรับภาษาไทยและอังกฤษ)
const anuphan = Anuphan({
  variable: "--font-anuphan",
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Novel Book Recommendation System",
  description: "Book recommendation system with Thai novel support",
};

/**
 * Root Layout Component
 * 
 * ✅ Error Boundary and Auth Provider are handled by AppProviders client component
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={anuphan.variable}>
      <body className="font-sans antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
