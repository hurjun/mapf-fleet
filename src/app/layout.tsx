import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MAPF Fleet — Multi-Robot Construction Site Simulator',
  description:
    'A 3D multi-agent path-finding simulator for multi-floor construction sites. Robots avoid collisions, yield to each other, and queue for elevators. Includes a model that recommends the optimal fleet size for a given building.',
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
