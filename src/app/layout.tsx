import type { Metadata, Viewport } from 'next';
import './globals.css';

const DESCRIPTION =
  'A 3D multi-agent path-finding simulator for multi-floor construction sites. Robots avoid collisions, yield to each other, and queue for elevators. Includes a model that recommends the optimal fleet size for a given building.';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mapf-fleet.vercel.app'),
  title: 'MAPF Fleet — Multi-Robot Construction Site Simulator',
  description: DESCRIPTION,
  authors: [{ name: 'hurjun' }],
  keywords: [
    'MAPF',
    'multi-agent path finding',
    'robotics',
    'fleet management',
    'construction robots',
    'simulation',
    'three.js',
  ],
  openGraph: {
    title: 'MAPF Fleet — Multi-Robot Construction Site Simulator',
    description: DESCRIPTION,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MAPF Fleet — Multi-Robot Construction Site Simulator',
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0a0c12',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
