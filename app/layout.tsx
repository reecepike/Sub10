import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sub-10',
  description: 'Adaptive coaching for IRONMAN Leeds 2027',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f3f1' },
    { media: '(prefers-color-scheme: dark)', color: '#101215' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap"
        />
        <link
          rel="icon"
          href={
            'data:image/svg+xml,' +
            encodeURIComponent(
              `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#14171a"/><text x="16" y="22" font-family="Archivo,sans-serif" font-size="15" font-weight="800" fill="#b23a22" text-anchor="middle">10</text></svg>`,
            )
          }
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
