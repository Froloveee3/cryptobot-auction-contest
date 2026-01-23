declare module 'prom-client' {
  
  

  export class Registry {
    metrics(): Promise<string> | string;
    contentType: string;
  }

  export function collectDefaultMetrics(opts?: { register?: Registry }): void;

  export class Counter<T extends string = string> {
    constructor(cfg: any);
    labels(...labelValues: string[]): { inc(value?: number): void };
  }

  export class Histogram<T extends string = string> {
    constructor(cfg: any);
    labels(...labelValues: string[]): { observe(value: number): void };
  }

  export class Gauge<T extends string = string> {
    constructor(cfg: any);
    labels(...labelValues: string[]): { inc(value?: number): void; dec(value?: number): void; set(value: number): void };
    inc(value?: number): void;
    dec(value?: number): void;
    set(value: number): void;
  }
}

