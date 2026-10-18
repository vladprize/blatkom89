// Sandbox-only minimal typings for `ws` (the real @types/ws is installed from npm in normal environments).
declare module 'ws' {
  import { EventEmitter } from 'node:events';
  import type { IncomingMessage, Server as HttpServer } from 'node:http';
  import type { Duplex } from 'node:stream';

  type RawData = Buffer | ArrayBuffer | Buffer[];

  class WebSocket extends EventEmitter {
    static readonly CONNECTING: 0;
    static readonly OPEN: 1;
    static readonly CLOSING: 2;
    static readonly CLOSED: 3;
    readonly OPEN: 1;
    readonly readyState: 0 | 1 | 2 | 3;
    readonly bufferedAmount: number;
    binaryType: 'nodebuffer' | 'arraybuffer' | 'fragments';
    constructor(address: string, options?: Record<string, unknown>);
    send(data: string | Buffer | ArrayBuffer | ArrayBufferView, cb?: (err?: Error) => void): void;
    send(
      data: string | Buffer | ArrayBuffer | ArrayBufferView,
      options: { binary?: boolean; compress?: boolean },
      cb?: (err?: Error) => void,
    ): void;
    close(code?: number, reason?: string): void;
    terminate(): void;
    ping(data?: unknown): void;
    on(event: 'message', listener: (data: RawData, isBinary: boolean) => void): this;
    on(event: 'close', listener: (code: number, reason: Buffer) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'pong', listener: () => void): this;
    on(event: 'open', listener: () => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }

  interface ServerOptions {
    noServer?: boolean;
    server?: HttpServer;
    path?: string;
    maxPayload?: number;
    perMessageDeflate?: boolean;
  }

  class WebSocketServer extends EventEmitter {
    constructor(options: ServerOptions);
    clients: Set<WebSocket>;
    handleUpgrade(
      req: IncomingMessage,
      socket: Duplex,
      head: Buffer,
      cb: (ws: WebSocket, req: IncomingMessage) => void,
    ): void;
    close(cb?: (err?: Error) => void): void;
    on(event: 'connection', listener: (ws: WebSocket, req: IncomingMessage) => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }

  export { WebSocket, WebSocketServer };
  export type { RawData, ServerOptions };
  export default WebSocket;
}
