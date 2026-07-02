import { useState } from "react";
import { t } from "../lib/i18n";
import { probeWakuLLM, probeWakuImage } from "../waku/polyverse";

// Runtime AI connectivity probe (fixed-payload smoke check): two buttons that each
// fire one in-content AI call — LLM (llm.chat.vision) and image
// (multimodal.generate.image) — and show the real backend reply. Real content uses
// the same pv.multimodal.generate path with its own prompt. Additive: on a
// missing/unauthed runtime the buttons just show err; main play is unaffected.

type ProbeStatus = "idle" | "busy" | "ok" | "err";

interface ProbeView {
  status: ProbeStatus;
  detail?: string;
  imageUrl?: string;
}

function errMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function statusLabel(status: ProbeStatus): string {
  return t(`probe_status_${status}`);
}

export function RuntimeProbe() {
  const [llm, setLlm] = useState<ProbeView>({ status: "idle" });
  const [img, setImg] = useState<ProbeView>({ status: "idle" });

  const runLlm = async () => {
    if (llm.status === "busy") return;
    setLlm({ status: "busy" });
    try {
      const text = await probeWakuLLM();
      setLlm({ status: "ok", detail: text });
    } catch (error) {
      setLlm({ status: "err", detail: errMessage(error) });
    }
  };

  const runImg = async () => {
    if (img.status === "busy") return;
    setImg({ status: "busy" });
    try {
      const url = await probeWakuImage();
      setImg({ status: "ok", imageUrl: url });
    } catch (error) {
      setImg({ status: "err", detail: errMessage(error) });
    }
  };

  return (
    <div className="runtime-probe" data-testid="runtime-probe">
      <div className="runtime-probe-row">
        <button
          type="button"
          className={`probe-button is-${llm.status}`}
          data-testid="probe-llm"
          disabled={llm.status === "busy"}
          onClick={runLlm}
        >
          <span className="probe-button-title">{t("probe_llm")}</span>
          <span className="probe-button-status">{statusLabel(llm.status)}</span>
        </button>
        <button
          type="button"
          className={`probe-button is-${img.status}`}
          data-testid="probe-image"
          disabled={img.status === "busy"}
          onClick={runImg}
        >
          <span className="probe-button-title">{t("probe_image")}</span>
          <span className="probe-button-status">{statusLabel(img.status)}</span>
        </button>
      </div>

      {(llm.detail || img.detail || img.imageUrl) && (
        <div className="runtime-probe-out" aria-live="polite">
          {llm.detail && (
            <p className={`probe-out-line is-${llm.status}`} data-testid="probe-llm-out">
              <span className="probe-out-tag">{t("probe_llm")}</span>
              {llm.detail}
            </p>
          )}
          {img.status === "err" && img.detail && (
            <p className="probe-out-line is-err" data-testid="probe-image-out">
              <span className="probe-out-tag">{t("probe_image")}</span>
              {img.detail}
            </p>
          )}
          {img.imageUrl && (
            <img
              className="probe-out-image"
              src={img.imageUrl}
              alt={t("probe_image")}
              data-testid="probe-image-result"
            />
          )}
        </div>
      )}
    </div>
  );
}
