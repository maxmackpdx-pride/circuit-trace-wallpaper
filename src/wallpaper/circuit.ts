import raw from "./circuit-data.json";

export type TracePath = {
  pts: [number, number][];
  h0: number;
  hd: number;
};

export type CircuitNode = {
  x: number;
  y: number;
  r: number;
  hue: number;
  ring: number;
  major: boolean;
};

export const circuit = raw as unknown as {
  worldW: number;
  worldH: number;
  traces: TracePath[];
  nodes: CircuitNode[];
};
