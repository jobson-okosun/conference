import { Injectable, signal } from '@angular/core';
import { SignalingMessage } from '../models/meeting.model';

@Injectable({
  providedIn: 'root'
})
export class SignalingService {
  private ws: WebSocket | null = null;
  private waiters = new Map<string, Array<{ resolve: (data: any) => void; reject: (err: any) => void; timer: any }>>();

  onEvent?: (msg: SignalingMessage) => void;
  isConnected = signal(false);

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.isConnected.set(true);
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as SignalingMessage;
          this.handleMessage(msg);
        } catch (e) {
          console.error('Failed to parse signaling message', e);
        }
      };

      this.ws.onclose = () => {
        this.isConnected.set(false);
        this.ws = null;
      };

      this.ws.onerror = (err) => {
        console.error('WebSocket error', err);
        reject(err);
      };
    });
  }

  send(type: string, data?: any) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }
    this.ws.send(JSON.stringify({ type, data }));
  }

  waitFor<T>(type: string, timeoutMs = 15000): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.removeWaiter(type, entry);
        reject(new Error(`Timeout waiting for server message: ${type}`));
      }, timeoutMs);

      const entry = { resolve, reject, timer };
      if (!this.waiters.has(type)) {
        this.waiters.set(type, []);
      }
      this.waiters.get(type)!.push(entry);
    });
  }

  private handleMessage(msg: SignalingMessage) {
    const { type, data } = msg;

    const waiters = this.waiters.get(type);
    if (waiters && waiters.length > 0) {
      const entry = waiters.shift()!;
      clearTimeout(entry.timer);
      entry.resolve(data);
      return;
    }

    if (this.onEvent) {
      this.onEvent(msg);
    }
  }

  private removeWaiter(type: string, entry: any) {
    const list = this.waiters.get(type);
    if (!list) return;
    const index = list.indexOf(entry);
    if (index !== -1) {
      list.splice(index, 1);
    }
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
    this.isConnected.set(false);
  }
}
