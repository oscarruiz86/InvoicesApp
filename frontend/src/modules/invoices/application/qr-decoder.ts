export interface QrCameraSession {
  stop(): void;
  destroy(): void;
}

export interface QrDecoder {
  preload?(): Promise<void>;
  openCamera(video: HTMLVideoElement, onResult: (content: string) => void, onError: (error: unknown) => void): Promise<QrCameraSession>;
  decodeImage(file: File, signal: AbortSignal): Promise<string>;
}

export type QrDecoderLoader = () => Promise<QrDecoder>;
