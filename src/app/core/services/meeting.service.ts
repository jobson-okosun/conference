import { Injectable, signal, inject } from '@angular/core';
import { SignalingService } from './signaling.service';
import { MediasoupService } from './mediasoup.service';
import { Participant, JoinResponse, RouterRtpCapabilitiesResponse, WebRtcTransportResponse, ProducedResponse, ConsumedResponse } from '../models/meeting.model';

@Injectable({
  providedIn: 'root'
})
export class MeetingService {
  private signaling = inject(SignalingService);
  private mediasoup = inject(MediasoupService);

  public participants = signal<Participant[]>([]);
  public isJoined = signal(false);
  public isMicMuted = signal(true);
  public isCamOff = signal(true);
  public myId = signal<string | null>(null);

  // Internal Mediasoup state (using any to avoid import errors from deep library paths)
  private sendTransport: any | null = null;
  private recvTransport: any | null = null;
  private audioProducer: any | null = null;
  private videoProducer: any | null = null;
  private consumers = new Map<string, any>();

  constructor() {
    this.signaling.onEvent = (msg) => this.handleEvent(msg);
  }

  async join(roomId: string, name: string, wsUrl: string) {
    await this.signaling.connect(wsUrl);

    // 1. Join Room
    this.signaling.send('join', { room_id: roomId, participant_name: name });
    const joinData = await this.signaling.waitFor<JoinResponse>('joined');
    this.myId.set(joinData.participant_id);

    // Load existing participants
    const initialParticipants: Participant[] = joinData.existing_participants.map(p => ({
      id: p.participant_id,
      name: p.participant_name,
      isMuted: false, 
      isCamOff: false,
      initials: this.getInitials(p.participant_name),
      stream: new MediaStream()
    }));
    this.participants.set(initialParticipants);

    // 2. Initialize Mediasoup Device
    this.signaling.send('getRouterRtpCapabilities');
    const { rtp_capabilities } = await this.signaling.waitFor<RouterRtpCapabilitiesResponse>('routerRtpCapabilities');
    await this.mediasoup.createDevice(rtp_capabilities);

    // 3. Create Transports
    await this.createSendTransport();
    await this.createRecvTransport();

    // 4. Start Media
    await this.publishLocalMedia();

    // 5. Consume existing
    for (const p of joinData.existing_participants) {
      for (const prod of p.producers) {
        this.consumeProducer(prod.producer_id, p.participant_id);
      }
    }

    this.isJoined.set(true);
  }

  private async createSendTransport() {
    this.signaling.send('createWebRtcTransport', { direction: 'send' });
    const data = await this.signaling.waitFor<WebRtcTransportResponse>('webRtcTransportCreated');

    this.sendTransport = this.mediasoup.createSendTransport({
      id: data.transport_id,
      iceParameters: data.ice_parameters,
      iceCandidates: data.ice_candidates,
      dtlsParameters: data.dtls_parameters,
    });

    this.sendTransport.on('connect', ({ dtlsParameters }: any, cb: any) => {
      this.signaling.send('connectWebRtcTransport', { transport_id: data.transport_id, dtls_parameters: dtlsParameters });
      cb();
    });

    this.sendTransport.on('produce', async ({ kind, rtpParameters, appData }: any, cb: any, eb: any) => {
      try {
        this.signaling.send('produce', {
          transport_id: this.sendTransport!.id,
          kind,
          rtp_parameters: rtpParameters,
          app_data: appData ?? {},
        });
        const { producer_id } = await this.signaling.waitFor<ProducedResponse>('produced');
        cb({ id: producer_id });
      } catch (err) {
        eb(err as Error);
      }
    });
  }

  private async createRecvTransport() {
    this.signaling.send('createWebRtcTransport', { direction: 'recv' });
    const data = await this.signaling.waitFor<WebRtcTransportResponse>('webRtcTransportCreated');

    this.recvTransport = this.mediasoup.createRecvTransport({
      id: data.transport_id,
      iceParameters: data.ice_parameters,
      iceCandidates: data.ice_candidates,
      dtlsParameters: data.dtls_parameters,
    });

    this.recvTransport.on('connect', ({ dtlsParameters }: any, cb: any) => {
      this.signaling.send('connectWebRtcTransport', { transport_id: data.transport_id, dtls_parameters: dtlsParameters });
      cb();
    });
  }

  private async publishLocalMedia() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      
      // Audio
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        this.audioProducer = await this.mediasoup.produce(this.sendTransport!, audioTrack, { source: 'mic' });
      }

      // Video
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        this.videoProducer = await this.mediasoup.produce(this.sendTransport!, videoTrack, { source: 'camera' });
      }

      // Add myself to participants
      const me: Participant = {
          id: this.myId()!,
          name: 'You',
          isMuted: false,
          isCamOff: false,
          initials: 'ME',
          stream: stream
      };
      this.participants.update(prev => [me, ...prev]);
    } catch (err) {
      console.error('Failed to get local media', err);
    }
  }

  private async consumeProducer(producerId: string, participantId: string) {
    this.signaling.send('consume', {
      producer_id: producerId,
      rtp_capabilities: this.mediasoup.rtpCapabilities,
    });

    const data = await this.signaling.waitFor<ConsumedResponse>('consumed');

    const consumer = await this.mediasoup.consume(this.recvTransport!, {
      id: data.consumer_id,
      producerId: data.producer_id,
      kind: data.kind,
      rtpParameters: data.rtp_parameters,
      appData: data.app_data
    });

    this.consumers.set(data.consumer_id, consumer);

    // Attach to participant stream
    this.participants.update(list => {
      const p = list.find(item => item.id === participantId);
      if (p) {
        if (!p.stream) p.stream = new MediaStream();
        p.stream.addTrack(consumer.track);
      }
      return [...list];
    });

    this.signaling.send('resumeConsumer', { consumer_id: data.consumer_id });
  }

  private handleEvent(msg: any) {
    const { type, data } = msg;
    switch (type) {
      case 'newParticipant':
        this.addParticipant(data);
        break;
      case 'participantLeft':
        this.removeParticipant(data.participant_id);
        break;
      case 'newProducer':
        this.consumeProducer(data.producer_id, data.participant_id);
        break;
      case 'producerClosed':
        // Handle producer closed
        break;
    }
  }

  private addParticipant(data: any) {
    const p: Participant = {
      id: data.participant_id,
      name: data.participant_name,
      isMuted: false,
      isCamOff: false,
      initials: this.getInitials(data.participant_name),
      stream: new MediaStream()
    };
    this.participants.update(prev => [...prev, p]);
  }

  private removeParticipant(id: string) {
    this.participants.update(prev => prev.filter(p => p.id !== id));
  }

  private getInitials(name: string): string {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  }

  leave() {
    this.signaling.send('leave');
    this.signaling.disconnect();
    this.audioProducer?.close();
    this.videoProducer?.close();
    this.sendTransport?.close();
    this.recvTransport?.close();
    this.isJoined.set(false);
    this.participants.set([]);
  }
}
