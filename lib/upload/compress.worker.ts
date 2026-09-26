import type { VideoConfig } from "./config";
import { transcodeVideo, type TranscodeOutcome } from "./video";

export type WorkerRequest =
  | { type: "transcode"; file: Blob; config: VideoConfig }
  | { type: "cancel" };

export type WorkerResponse =
  | { type: "ready" }
  | { type: "progress"; progress: number }
  | { type: "result"; outcome: TranscodeOutcome };

type WorkerScope = {
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
  addEventListener(type: "message", listener: (e: MessageEvent<WorkerRequest>) => void): void;
};

const scope = self as unknown as WorkerScope;
const controller = new AbortController();

scope.addEventListener("message", (e) => {
  const msg = e.data;
  if (msg.type === "cancel") {
    controller.abort();
    return;
  }
  if (msg.type === "transcode") {
    void transcodeVideo(msg.file, msg.config, {
      signal: controller.signal,
      onProgress: (progress) => scope.postMessage({ type: "progress", progress }),
    }).then((outcome) => {
      scope.postMessage(
        { type: "result", outcome },
        outcome.ok ? [outcome.buffer] : [],
      );
    });
  }
});

scope.postMessage({ type: "ready" });
