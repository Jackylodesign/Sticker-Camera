// This file runs in a Web Worker: a separate background thread.
// Running the AI model here keeps the page (buttons, spinners) responsive
// while the heavy maths happens.

import { AutoModel, AutoProcessor, RawImage, env } from "@huggingface/transformers";
import type { PreTrainedModel, Processor } from "@huggingface/transformers";
import { MODEL } from "./constants";
import type { WorkerRequest, WorkerResponse } from "./removeBackground";

// Always download from the Hugging Face hub (never look for files on our own server).
// The downloaded model is stored in the browser's Cache Storage, so it is
// only downloaded once.
env.allowLocalModels = false;

const post = (msg: WorkerResponse, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(msg, transfer);

let loading: Promise<{ model: PreTrainedModel; processor: Processor }> | null = null;

// Sum download progress across files (the model weights are by far the biggest).
const fileProgress = new Map<string, { loaded: number; total: number }>();
function onProgress(p: { status: string; file?: string; loaded?: number; total?: number }) {
  if (p.status !== "progress" || !p.file || !p.total) return;
  fileProgress.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
  let loaded = 0;
  let total = 0;
  for (const f of fileProgress.values()) {
    loaded += f.loaded;
    total += f.total;
  }
  post({ type: "progress", loaded, total });
}

async function loadModel(device: "webgpu" | "wasm") {
  // RMBG-1.4 has no transformers.js-specific config on the hub, so we pass
  // it in directly. "custom" tells transformers.js to use a plain model
  // wrapper, and the processor settings mirror the model's own preprocessing.
  const model = await AutoModel.from_pretrained(MODEL.id, {
    config: { model_type: "custom" } as never,
    dtype: MODEL.dtype,
    device,
    progress_callback: onProgress,
  });
  const processor = await AutoProcessor.from_pretrained(MODEL.id, {
    config: {
      do_normalize: true,
      do_pad: false,
      do_rescale: true,
      do_resize: true,
      image_mean: [0.5, 0.5, 0.5],
      image_std: [1, 1, 1],
      feature_extractor_type: "ImageFeatureExtractor",
      resample: 2,
      rescale_factor: 1 / 255,
      size: { width: MODEL.inputSize, height: MODEL.inputSize },
    } as never,
  });
  return { model, processor };
}

function getModel() {
  if (!loading) {
    // Prefer the GPU (WebGPU) when the browser has it; fall back to the CPU
    // (WebAssembly), which works everywhere but is slower.
    const hasWebGPU = "gpu" in navigator;
    loading = (hasWebGPU ? loadModel("webgpu") : Promise.reject(new Error("no webgpu")))
      .catch(() => loadModel("wasm"))
      .then((m) => {
        post({ type: "ready" });
        return m;
      });
    loading.catch(() => (loading = null)); // allow a retry after a failure
  }
  return loading;
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  try {
    const { model, processor } = await getModel();
    if (msg.type !== "segment") return;

    // Photo pixels in, one-channel "how much is this pixel the subject" mask out.
    const image = new RawImage(msg.pixels, msg.width, msg.height, 4).rgb();
    const { pixel_values } = await processor(image);
    const outputs = await model({ input: pixel_values });
    const result = Object.values(outputs)[0] as { mul: (n: number) => { to: (t: string) => { data: Uint8Array } } };
    const mask = result.mul(255).to("uint8").data;

    post(
      { type: "mask", id: msg.id, mask, size: MODEL.inputSize },
      [mask.buffer as ArrayBuffer],
    );
  } catch (err) {
    post({ type: "error", id: msg.type === "segment" ? msg.id : undefined, message: String(err) });
  }
};
