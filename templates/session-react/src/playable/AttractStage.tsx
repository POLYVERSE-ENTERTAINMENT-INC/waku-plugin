import { useEffect, useRef } from "react";

/**
 * The template's .stage layer: a full-bleed interactive stage, peer to .bg-layer /
 * .safe-ui. It runs a faint attract animation (the first screen moves before it's
 * touched) and doubles as the live example for canvas/world games.
 *
 * For a real game, swap the attract draw for your world/camera/collision; the
 * <canvas> stays on .stage filling the viewport. Put readable/tappable HUD and
 * buttons in .safe-ui, never on the canvas edges.
 */
export function AttractStage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Resample canvas to viewport × DPR: CSS fills .stage, bitmap tracks device pixels.
    let cssW = 0;
    let cssH = 0;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      cssW = window.innerWidth;
      cssH = window.innerHeight;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels from here
    };
    resize();
    window.addEventListener("resize", resize);

    // faint slow-rising dots, pure ambience — swap for your world draw in a real game
    const dots = Array.from({ length: 18 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 1 + Math.random() * 2,
      v: 0.004 + Math.random() * 0.012,
    }));

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    const draw = () => {
      ctx.clearRect(0, 0, cssW, cssH);
      for (const d of dots) {
        ctx.beginPath();
        ctx.arc(d.x * cssW, d.y * cssH, d.r, 0, Math.PI * 2);
        ctx.fillStyle = "oklch(78% 0.14 220 / 0.16)";
        ctx.fill();
      }
    };

    if (reduceMotion) {
      draw();
      window.removeEventListener("resize", resize);
      window.addEventListener("resize", () => {
        resize();
        draw();
      });
      return;
    }

    let raf = 0;
    const loop = () => {
      for (const d of dots) {
        d.y -= d.v * 0.016; // drift up, wrap from the bottom
        if (d.y < -0.05) {
          d.y = 1.05;
          d.x = Math.random();
        }
      }
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div className="stage" aria-hidden="true">
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
    </div>
  );
}
