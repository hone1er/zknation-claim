import "@/styles/globals.css";

import { GeistSans } from "geist/font/sans";
import { Web3Provider } from "./context/Web3";
import { Analytics } from "@vercel/analytics/react";
export const metadata = {
  title: "ZK Claim helper",
  description:
    "A helper tool to claim your ZK tokens from an L1 multi-sig wallet. ",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${GeistSans.variable}`}>
      <body>
        {" "}
        <Web3Provider>{children}</Web3Provider>
        <Analytics />
      </body>
    </html>
  );
}
