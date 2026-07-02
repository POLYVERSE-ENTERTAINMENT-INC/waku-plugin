import { useEffect, useRef, useState } from "react";
import { createTiltController, type TiltSource } from "../lib/devicemotion";
import { playWakuHaptic } from "../waku/polyverse";
import { t } from "../lib/i18n";

// Live smoke check for the device-motion + haptics path (sibling to RuntimeProbe).
// Two bars track the calibrated tilt axis, "Buzz" fires a haptic, and shaking the
// device bumps the counter. In the simulator the sensor feed drives the bars; on
// desktop the controller's pointer-drag fallback does. Doubles as the copyable
// example for content that needs tilt/shake/haptics.
export function DeviceProbe() {
  const [source, setSource] = useState<TiltSource>("none");
  const [shakes, setShakes] = useState(0);
  const xRef = useRef<HTMLDivElement>(null);
  const yRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctrl = createTiltController({
      // Write straight to a CSS var to avoid re-rendering on every frame.
      onTilt: (x, y) => {
        xRef.current?.style.setProperty("--v", x.toFixed(3));
        yRef.current?.style.setProperty("--v", y.toFixed(3));
      },
      onShake: () => {
        setShakes((n) => n + 1);
        void playWakuHaptic("heavy");
      },
      onSource: setSource,
    });
    // requestPermission resolves true off-iOS; iOS needs a user gesture but the
    // sim/desktop fallback still works without one.
    void ctrl.requestPermission().then(() => ctrl.start());
    return () => ctrl.destroy();
  }, []);

  return (
    <div className="device-probe">
      <div className="device-probe-row">
        <div className="device-probe-bars">
          <div className="device-probe-axis" ref={xRef} />
          <div className="device-probe-axis" ref={yRef} />
        </div>
        <button
          className="device-probe-buzz"
          type="button"
          onClick={() => void playWakuHaptic("medium")}
        >
          {t("probe_buzz")}
        </button>
      </div>
      <p className="device-probe-meta">
        {t("probe_tilt")}: {source} · {t("probe_shake")}: {shakes}
      </p>
    </div>
  );
}
