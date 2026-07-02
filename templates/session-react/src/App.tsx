import { useEffect, useState } from "react";
import { DefaultPlayable } from "./playable/DefaultPlayable";
import { AttractStage } from "./playable/AttractStage";
import { RuntimeProbe } from "./playable/RuntimeProbe";
import { DeviceProbe } from "./playable/DeviceProbe";
import { usePlayableState } from "./playable/usePlayableState";
import { initI18n, onLangChange, t } from "./lib/i18n";
import { lockGestures } from "./lib/gestures";
import { preloadAssets } from "./lib/preload";

export function App() {
  const playable = usePlayableState();
  const [, setLangTick] = useState(0);
  const [i18nReady, setI18nReady] = useState(false);

  useEffect(() => {
    lockGestures();
    // Warm content assets up front, videos first. Real content lists its GCS
    // video URLs here so they download the moment the playable loads.
    void preloadAssets({ videos: [], images: ["./bg-texture.webp"] });
    let cancelled = false;

    initI18n()
      .then(() => {
        if (!cancelled) {
          document.title = t("title");
          setI18nReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) setI18nReady(true);
      });

    const unsubscribe = onLangChange(() => {
      document.title = t("title");
      setLangTick((v) => v + 1);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return (
    <>
      {/*
        Optional shell layers, stacked by z-order (geometry via index.css named vars):
          1) .bg-layer  full-bleed non-interactive backdrop (ambience).
          2) .stage     full-bleed interactive stage for canvas/world; <AttractStage/>
                        is the live example.
          3) .safe-ui   safe area, pass-through; holds readable/tappable UI (HUD,
                        buttons, copy, cards).
        Rule: full-screen visuals → .bg-layer/.stage; anything readable/tappable goes
        in .safe-ui, never on the canvas edges (the host chrome would clip it).
      */}
      <div className="bg-layer" aria-hidden="true" />
      <AttractStage />

      {/* Safe-area UI layer. This demo's tap target is readable UI, so it belongs here. */}
      <main className="safe-ui" {...(i18nReady ? playable.dataset : { "data-phase": "loading" })}>
        {/* Top of safe area: runtime AI connectivity probe (fixed-payload smoke). */}
        <RuntimeProbe />
        {/* Device-motion + haptics smoke check (tilt bars / Buzz / shake count). */}
        <DeviceProbe />
        <section
          id="safe-center"
          className="safe-center"
          aria-live="polite"
          data-result={i18nReady ? playable.state.result?.outcome ?? "" : ""}
        >
          {i18nReady ? (
            <DefaultPlayable
              state={playable.state}
              onPrimaryPointer={playable.handlePrimaryPointer}
              onReplay={playable.reset}
            />
          ) : (
            <div className="text-sm font-semibold tracking-[0.18em] text-[var(--muted)]">Loading</div>
          )}
        </section>
      </main>
    </>
  );
}
