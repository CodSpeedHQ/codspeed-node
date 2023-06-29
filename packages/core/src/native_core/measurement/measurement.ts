export interface Measurement {
  isInstrumented: () => boolean;
  startInstrumentation: () => void;
  stopInstrumentation: (pos: string) => void;
}
