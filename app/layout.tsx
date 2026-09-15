import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Orbitron, Cinzel, Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "./context/ThemeContext";
import UbaAssistant from "./components/UbaAssistant";


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
  weight: ["500", "700", "900"],
});

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["500", "700", "900"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "UBA — Universal Business Assistant",
  description: "Your all-in-one business management assistant.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#8b5cf6",
};

export default function RootLayout({ children }: LayoutProps<"/">) {


  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${orbitron.variable} ${cinzel.variable} ${inter.variable} h-full antialiased`}
    >
        <body className="min-h-full flex flex-col">
        <ThemeProvider>
          {children}
          <UbaAssistant />
        </ThemeProvider>
      </body>
    </html>
  );
}