// This file runs in a Web Worker: a separate background thread.
// Running the AI models here keeps the page (buttons, spinners) responsive
// while the heavy maths happens. Two models live here:
//   - RMBG-1.4: cuts out the foreground with clean, soft edges.
//   - SlimSAM: finds the one object the user tapped on.

import { AutoModel, AutoProcessor, ImageProcessor, RawImage, SamModel, Tensor, env } from "@huggingface/transformers";
import type { PreTrainedModel, Processor } from "@huggingface/transformers";
import { MODEL, SAM_MODEL } from "./constants";
import type { WorkerRequest, WorkerResponse } from "./models";

// Always download from the Hugging Face hub (never look for files on our own server).
// Downloaded models are stored in the browser's Cache Storage, so they are
// only downloaded once.
env.allowLocalModels = false;

const post = (msg: WorkerResponse, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(msg, transfer);

type Device = "webgpu" | "wasm";

// ---------- download progress (summed over every file of both models) ----------
const fileProgress = new Map<string, { loaded: number; total: number }>();
function onProgress(p: { status: string; name?: string; file?: string; loaded?: number; total?: number }) {
  if (p.status !== "progress" || !p.file || !p.total) return;
  fileProgress.set(`${p.name}/${p.file}`, { loaded: p.loaded ?? 0, total: p.total });
  let loaded = 0;
  let total = 0;
  for (const f of fileProgress.values()) {
    loaded += f.loaded;
    total += f.total;
  }
  post({ type: "progress", loaded, total });
}

// ---------- loading ----------

// Prefer the GPU (WebGPU) when the browser really has one; otherwise use the
// CPU (WebAssembly), which works everywhere but is slower. We check for a GPU
// "adapter" first because a browser can know about WebGPU yet have no usable GPU.
async function pickDevice(): Promise<Device> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    if (gpu && (await gpu.requestAdapter())) return "webgpu";
  } catch {
    // fall through to wasm
  }
  return "wasm";
}

async function loadRmbg(device: Device) {
  // RMBG-1.4 has no transformers.js-specific config on the hub, so we pass
  // it in directly. "custom" tells transformers.js to use a plain model wrapper.
  const model = await AutoModel.from_pretrained(MODEL.id, {
    config: { model_type: "custom" } as never,
    dtype: MODEL.dtype,
    device,
    progress_callback: onProgress,
  });
  // Resize to a 1024x1024 square and scale colours the way RMBG-1.4 expects.
  const processor = new ImageProcessor({
    do_normalize: true,
    do_rescale: true,
    do_resize: true,
    image_mean: [0.5, 0.5, 0.5],
    image_std: [1, 1, 1],
    resample: 2, // bilinear
    rescale_factor: 1 / 255,
    size: { width: MODEL.inputSize, height: MODEL.inputSize },
  });
  return { model, processor };
}

async function loadSam(device: Device) {
  const model = (await SamModel.from_pretrained(SAM_MODEL.id, {
    dtype: SAM_MODEL.dtype,
    device,
    progress_callback: onProgress,
  })) as SamModel;
  const processor = await AutoProcessor.from_pretrained(SAM_MODEL.id, { progress_callback: onProgress });
  return { model, processor };
}

type Models = {
  rmbg: { model: PreTrainedModel; processor: ImageProcessor };
  sam: { model: SamModel; processor: Processor };
};
let loading: Promise<Models> | null = null;

function getModels(): Promise<Models> {
  if (!loading) {
    const p: Promise<Models> = pickDevice()
      .then(async (device) => {
        // Load one after the other, so the progress bar keeps moving steadily.
        const sam = await loadSam(device);
        const rmbg = await loadRmbg(device);
        return { rmbg, sam };
      })
      .then((m) => {
        post({ type: "ready" });
        return m;
      });
    p.catch(() => (loading = null)); // allow a retry after a failure
    loading = p;
  }
  return loading;
}

// ---------- the work ----------

// SAM works in two steps. The slow step "reads" the whole photo once
// (embedding). After that, each tap only runs the small, fast decoder.
// We keep the latest photo's embedding here.
type SamInputs = { original_sizes: [number, number][]; reshaped_input_sizes: [number, number][] };
let samPhoto: { id: number; inputs: SamInputs; embeddings: Record<string, Tensor> } | null = null;

async function handle(msg: WorkerRequest) {
  const { rmbg, sam } = await getModels();

  if (msg.type === "foreground") {
    // Photo pixels in, one-channel "how much is this pixel foreground" mask out.
    const image = new RawImage(msg.pixels, msg.width, msg.height, 4).rgb();
    const { pixel_values } = await rmbg.processor(image);
    const outputs = await rmbg.model({ input: pixel_values });
    const result = Object.values(outputs)[0] as Tensor;
    const mask = result.mul(255).to("uint8").data as Uint8Array;
    post({ type: "foreground", id: msg.id, mask, size: MODEL.inputSize }, [mask.buffer as ArrayBuffer]);
  } else if (msg.type === "sam-embed") {
    const image = new RawImage(msg.pixels, msg.width, msg.height, 4).rgb();
    const inputs = await sam.processor(image);
    const embeddings = await sam.model.get_image_embeddings(inputs);
    samPhoto = { id: msg.id, inputs, embeddings };
    post({ type: "sam-embed", id: msg.id });
  } else if (msg.type === "sam-select") {
    if (!samPhoto || samPhoto.id !== msg.photoId) throw new Error("Photo not prepared for selection");
    const { inputs, embeddings } = samPhoto;
    // Taps arrive in photo pixels; SAM wants them in its own resized coordinates.
    const [origH, origW] = inputs.original_sizes[0];
    const [resH, resW] = inputs.reshaped_input_sizes[0];
    const n = msg.points.length;
    const input_points = new Tensor(
      "float32",
      Float32Array.from(msg.points.flatMap((p) => [(p.x * resW) / origW, (p.y * resH) / origH])),
      [1, 1, n, 2],
    );
    // Label 1 = "this is part of the object", 0 = "this is not".
    const input_labels = new Tensor("int64", BigInt64Array.from(msg.points.map((p) => BigInt(p.include ? 1 : 0))), [1, 1, n]);

    const outputs = await sam.model({ ...embeddings, input_points, input_labels });
    // SAM proposes 3 masks (small part / medium / whole object) with a confidence
    // score each. We take the most confident one.
    const masks = await (sam.processor as unknown as {
      post_process_masks: (m: Tensor, o: unknown, r: unknown) => Promise<Tensor[]>;
    }).post_process_masks(outputs.pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes);
    const scores = outputs.iou_scores.data as Float32Array;
    let best = 0;
    for (let i = 1; i < scores.length; i++) if (scores[i] > scores[best]) best = i;
    const size = origW * origH;
    const mask = (masks[0].data as Uint8Array).slice(best * size, (best + 1) * size); // 0 or 1 per pixel
    post({ type: "sam-select", id: msg.id, mask }, [mask.buffer as ArrayBuffer]);
  }
}

// Run one job at a time: the models share the GPU/CPU, and the order of
// requests (embed the photo, then taps) matters.
let queue: Promise<void> = Promise.resolve();
self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  queue = queue.then(async () => {
    try {
      if (msg.type === "preload") await getModels();
      else await handle(msg);
    } catch (err) {
      post({ type: "error", id: msg.type === "preload" ? undefined : msg.id, message: String(err) });
    }
  });
};
