'use client';

/** Live site configuration and playback controls. */

import { useSim } from '@/state/store';
import { PARAM_BOUNDS } from '@/sim/scenarios';
import { ScenarioId } from '@/sim/types';
import { Button, Panel, Segmented, Slider } from './ui';

const SCENARIOS: Array<{ value: ScenarioId; label: string }> = [
  { value: 'apartment', label: 'Apartment' },
  { value: 'factory', label: 'Factory' },
];

export function ControlPanel() {
  const scenario = useSim((s) => s.scenario);
  const params = useSim((s) => s.params);
  const robotCount = useSim((s) => s.robotCount);
  const speed = useSim((s) => s.speed);
  const running = useSim((s) => s.running);

  const setScenario = useSim((s) => s.setScenario);
  const setParam = useSim((s) => s.setParam);
  const setRobotCount = useSim((s) => s.setRobotCount);
  const setSpeed = useSim((s) => s.setSpeed);
  const togglePlay = useSim((s) => s.togglePlay);
  const reset = useSim((s) => s.reset);

  const B = PARAM_BOUNDS;

  return (
    <Panel title="Site configuration">
      <div className="space-y-3">
        <Segmented options={SCENARIOS} value={scenario} onChange={setScenario} />

        <Slider
          label="Floors"
          value={params.numFloors}
          min={B.numFloors.min}
          max={B.numFloors.max}
          onChange={(v) => setParam('numFloors', v)}
        />
        <Slider
          label="Elevators"
          value={params.elevatorCount}
          min={B.elevatorCount.min}
          max={B.elevatorCount.max}
          onChange={(v) => setParam('elevatorCount', v)}
        />
        <Slider
          label="Elevator capacity"
          value={params.elevatorCapacity}
          min={B.elevatorCapacity.min}
          max={B.elevatorCapacity.max}
          unit=" robots"
          onChange={(v) => setParam('elevatorCapacity', v)}
        />
        <Slider
          label="Floor width"
          value={params.width}
          min={B.width.min}
          max={B.width.max}
          unit=" m"
          onChange={(v) => setParam('width', v)}
        />
        <Slider
          label="Floor depth"
          value={params.height}
          min={B.height.min}
          max={B.height.max}
          unit=" m"
          onChange={(v) => setParam('height', v)}
        />

        <div className="h-px bg-white/10" />

        <Slider
          label="Robots"
          value={robotCount}
          min={B.robotCount.min}
          max={B.robotCount.max}
          onChange={setRobotCount}
          hint="Adjust live — robots are added or removed without restarting the run."
        />
        <Slider label="Speed" value={speed} min={1} max={20} unit="×" onChange={setSpeed} />

        <div className="flex gap-2 pt-0.5">
          <Button variant="primary" onClick={togglePlay} className="flex-1">
            {running ? 'Pause' : 'Play'}
          </Button>
          <Button onClick={reset} className="flex-1">
            Reset
          </Button>
        </div>
      </div>
    </Panel>
  );
}
