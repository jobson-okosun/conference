import { Injectable } from '@angular/core';
import * as mediasoup from 'mediasoup-client';

@Injectable({
  providedIn: 'root'
})
export class MediasoupService {
  private device: any | null = null;

  async createDevice(routerRtpCapabilities: any): Promise<any> {
    this.device = new mediasoup.Device();
    await this.device.load({ routerRtpCapabilities });
    return this.device;
  }

  get rtpCapabilities(): any {
    if (!this.device) throw new Error('Device not initialized');
    return this.device.rtpCapabilities;
  }

  createSendTransport(options: any): any {
    if (!this.device) throw new Error('SendTransport: Device not initialized');
    return this.device.createSendTransport(options);
  }

  createRecvTransport(options: any): any {
    if (!this.device) throw new Error('RecvTransport: Device not initialized');
    return this.device.createRecvTransport(options);
  }

  async produce(transport: any, track: MediaStreamTrack, appData: any = {}): Promise<any> {
    if (track.kind === 'video') {
      return await transport.produce({
        track,
        encodings: [
          { rid: 'r0', maxBitrate: 100000, scaleResolutionDownBy: 4 },
          { rid: 'r1', maxBitrate: 300000, scaleResolutionDownBy: 2 },
          { rid: 'r2', maxBitrate: 900000, scaleResolutionDownBy: 1 },
        ],
        codecOptions: { videoGoogleStartBitrate: 1000 },
        appData: appData
      });
    } else {
      return await transport.produce({
        track,
        codecOptions: { opusStereo: true, opusDtx: true },
        appData: appData
      });
    }
  }

  async consume(transport: any, options: { id: string; producerId: string; kind: any; rtpParameters: any; appData?: any }): Promise<any> {
    return await transport.consume(options);
  }
}
