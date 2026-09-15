import "@/styles/globals.css";
import type { Metadata } from "next";
import { Providers } from "./providers";
import { StudioNav } from "@/components/studio-nav";
import { fontSans, fontDisplay } from "@/config/fonts";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: { default: siteConfig.name, template: `%s · ${siteConfig.name}` },
  description: siteConfig.description,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${fontSans.variable} ${fontDisplay.variable}`}>
        <Providers themeProps={{ attribute: "class", forcedTheme: "light" }}>
          <div className="studio-shell">
            <StudioNav />
            <main id="main-content" className="studio-main">
              {children}
              <footer className="studio-footer">
                <span>SABR & STEPS</span>
                <span>Made with intention. One reminder at a time.</span>
              </footer>
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
