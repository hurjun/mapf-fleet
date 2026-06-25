'use client';

import { Panel } from './ui';

export function Header() {
  return (
    <Panel>
      <h1 className="text-sm font-semibold tracking-tight text-white">MAPF Fleet</h1>
      <p className="mt-0.5 text-[11px] leading-snug text-white/45">
        Multi-agent path-finding for a multi-floor construction site. Robots avoid
        collisions, yield to one another, and queue for elevators.
      </p>
    </Panel>
  );
}
