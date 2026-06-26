'use client';

/** Live site configuration and playback controls. */

import { CameraPreset, useSim } from '@/state/store';
import { PlannerKind } from '@/sim/engine';
import { PARAM_BOUNDS } from '@/sim/scenarios';
import { ScenarioId } from '@/sim/types';
import { Button, Panel, Segmented, Slider, Toggle } from './ui';

const SCENARIOS: Array<{ value: ScenarioId; label: string }> = [
  { value: 'apartment', label: 'Apartment' },
  { value: 'factory', label: 'Factory' },
  { value: 'warehouse', label: 'Warehouse' },
];

const PLANNERS: Array<{ value: PlannerKind; label: string }> = [
  { value: 'prioritized', label: 'Prioritized' },
  { value: 'cbs', label: 'CBS (optimal)' },
];

const VIEWS: Array<{ value: CameraPreset; label: string }> = [
  { value: 'iso', label: 'Iso' },
  { value: 'top', label: 'Top' },
  { value: 'side', label: 'Side' },
];

export function ControlPanel() {
  const scenario = useSim((s) => s.scenario);
  const params = useSim((s) => s.params);
  const robotCount = useSim((s) => s.robotCount);
  const speed = useSim((s) => s.speed);
  const running = useSim((s) => s.running);
  const planner = useSim((s) => s.planner);
  const showPaths = useSim((s) => s.showPaths);
  const showHeat = useSim((s) => s.showHeat);
  const showTrails = useSim((s) => s.showTrails);
  const cameraPreset = useSim((s) => s.cameraPreset);
  const focusFloor = useSim((s) => s.focusFloor);
  const bloom = useSim((s) => s.bloom);
  const followSelected = useSim((s) => s.followSelected);
  const autoRotate = useSim((s) => s.autoRotate);

  const setScenario = useSim((s) => s.setScenario);
  const setParam = useSim((s) => s.setParam);
  const setRobotCount = useSim((s) => s.setRobotCount);
  const setSpeed = useSim((s) => s.setSpeed);
  const setPlanner = useSim((s) => s.setPlanner);
  const setShowPaths = useSim((s) => s.setShowPaths);
  const setShowHeat = useSim((s) => s.setShowHeat);
  const setShowTrails = useSim((s) => s.setShowTrails);
  const setCameraPreset = useSim((s) => s.setCameraPreset);
  const setFocusFloor = useSim((s) => s.setFocusFloor);
  const setBloom = useSim((s) => s.setBloom);
  const setFollowSelected = useSim((s) => s.setFollowSelected);
  const setAutoRotate = useSim((s) => s.setAutoRotate);
  const togglePlay = useSim((s) => s.togglePlay);
  const stepOnce = useSim((s) => s.stepOnce);
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

        <div>
          <div className="mb-1.5 text-xs text-white/70">Planner</div>
          <Segmented options={PLANNERS} value={planner} onChange={setPlanner} />
          <p className="mt-1 text-[10px] leading-snug text-white/35">
            Prioritized is fast; CBS searches for an optimal conflict-free plan
            (heavier, falls back when a floor is too tangled).
          </p>
        </div>

        <Toggle label="Show all planned paths" value={showPaths} onChange={setShowPaths} />
        <Toggle label="Congestion heatmap" value={showHeat} onChange={setShowHeat} />
        <Toggle label="Motion trails" value={showTrails} onChange={setShowTrails} />

        <div>
          <div className="mb-1.5 text-xs text-white/70">Camera</div>
          <Segmented options={VIEWS} value={cameraPreset} onChange={setCameraPreset} />
        </div>
        <Toggle label="Auto-rotate camera" value={autoRotate} onChange={setAutoRotate} />
        <Toggle label="Focus map floor" value={focusFloor} onChange={setFocusFloor} />
        <Toggle label="Follow selected robot" value={followSelected} onChange={setFollowSelected} />
        <Toggle label="Glow (bloom)" value={bloom} onChange={setBloom} />

        <div className="flex gap-2 pt-0.5">
          <Button variant="primary" onClick={togglePlay} className="flex-1">
            {running ? 'Pause' : 'Play'}
          </Button>
          <Button onClick={stepOnce} className="flex-1">
            Step
          </Button>
          <Button onClick={reset} className="flex-1">
            Reset
          </Button>
        </div>

        <p className="pt-0.5 text-[10px] leading-relaxed text-white/30">
          Keys: Space play · S step · P paths · F focus · 1/2/3 view · ↑/↓ floor ·
          [ / ] speed · U panels · Esc deselect
        </p>
      </div>
    </Panel>
  );
}
