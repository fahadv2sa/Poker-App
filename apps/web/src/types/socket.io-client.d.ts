/**
 * Minimal ambient shim for `socket.io-client`.
 *
 * The package is not present in this offline environment, so this declaration
 * lets the realtime client typecheck. Once `socket.io-client` is installed
 * (`pnpm add socket.io-client -F @fp/web`), its bundled types take precedence —
 * delete this file at that point.
 */
declare module "socket.io-client" {
  export interface Socket {
    id: string;
    connected: boolean;
    on(event: string, listener: (...args: unknown[]) => void): Socket;
    off(event: string, listener?: (...args: unknown[]) => void): Socket;
    emit(event: string, ...args: unknown[]): Socket;
    disconnect(): Socket;
  }

  export interface SocketOptions {
    auth?: object;
    transports?: string[];
    withCredentials?: boolean;
    autoConnect?: boolean;
  }

  export function io(uri: string, opts?: SocketOptions): Socket;
}
