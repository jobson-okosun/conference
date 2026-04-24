import { Injectable, signal, inject } from '@angular/core';
import { SignalingService } from './signaling.service';
import { MediasoupService } from './mediasoup.service';
import { Participant, JoinResponse, RouterRtpCapabilitiesResponse, WebRtcTransportResponse, ProducedResponse, ConsumedResponse } from '../models/meeting.model';
import { SoundService } from './sound.service';

@Injectable({
  providedIn: 'root'
})
export class MeetingService {
  private signalingService = inject(SignalingService);
  private mediasoupService = inject(MediasoupService);
  private soundService = inject(SoundService);

  public participants = signal<Participant[]>([]);
  public isJoined = signal(false);
  public isMicMuted = signal(true);
  public isCamOff = signal(true);
  public myId = signal<string | null>(null);

  private sendTransport: any | null = null;
  private recvTransport: any | null = null;
  private audioProducer: any | null = null;
  private videoProducer: any | null = null;
  private consumers = new Map<string, any>();

  constructor() {
    this.signalingService.onEvent = (msg) => this.handleEvent(msg);
  }

  async join(roomId: string, name: string, wsUrl: string) {
    await this.signalingService.connect(wsUrl);

    //1. Join Room
    this.signalingService.send('join', { room_id: roomId, participant_name: name });
    const joinData = await this.signalingService.waitFor<JoinResponse>('joined');
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
    this.signalingService.send('getRouterRtpCapabilities');
    const { rtp_capabilities } = await this.signalingService.waitFor<RouterRtpCapabilitiesResponse>('routerRtpCapabilities');
    await this.mediasoupService.createDevice(rtp_capabilities);

    // 3. Create Transports
    await this.createSendTransport();
    await this.createRecieveTransport();

    // 4. Start Media
    await this.publishLocalMedia();

    // 5. Consume existing
    for (const p of joinData.existing_participants) {
      for (const prod of p.producers) {
        this.consumeProducer(prod.producer_id, p.participant_id);
      }
    }

    this.isJoined.set(true);
    this.soundService.playJoin();
  }

  private async createSendTransport() {
    this.signalingService.send('createWebRtcTransport', { direction: 'send' });
    const data = await this.signalingService.waitFor<WebRtcTransportResponse>('webRtcTransportCreated');

    this.sendTransport = this.mediasoupService.createSendTransport({
      id: data.transport_id,
      iceParameters: data.ice_parameters,
      iceCandidates: data.ice_candidates,
      dtlsParameters: data.dtls_parameters,
    });

    this.sendTransport.on('connect', ({ dtlsParameters }: any, cb: any) => {
      this.signalingService.send('connectWebRtcTransport', { transport_id: data.transport_id, dtls_parameters: dtlsParameters });
      cb();
    });

    this.sendTransport.on('produce', async ({ kind, rtpParameters, appData }: any, cb: any, eb: any) => {
      try {
        this.signalingService.send('produce', {
          transport_id: this.sendTransport!.id,
          kind,
          rtp_parameters: rtpParameters,
          app_data: appData ?? {},
        });
        const { producer_id } = await this.signalingService.waitFor<ProducedResponse>('produced');
        cb({ id: producer_id });
      } catch (err) {
        eb(err as Error);
      }
    });
  }

  private async createRecieveTransport() {
    this.signalingService.send('createWebRtcTransport', { direction: 'recv' });
    const data = await this.signalingService.waitFor<WebRtcTransportResponse>('webRtcTransportCreated');

    this.recvTransport = this.mediasoupService.createRecvTransport({
      id: data.transport_id,
      iceParameters: data.ice_parameters,
      iceCandidates: data.ice_candidates,
      dtlsParameters: data.dtls_parameters,
    });

    this.recvTransport.on('connect', ({ dtlsParameters }: any, cb: any) => {
      this.signalingService.send('connectWebRtcTransport', { transport_id: data.transport_id, dtls_parameters: dtlsParameters });
      cb();
    });
  }

  private async publishLocalMedia() {
    try {
      console.log('Requesting local media...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: { width: 1280, height: 720 } 
      });
      console.log('Local media captured:', stream.id, 'Tracks:', stream.getTracks().length);
      
      // 1. Audio
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !this.isMicMuted();
        this.audioProducer = await this.mediasoupService.produce(this.sendTransport!, audioTrack, { source: 'mic' });
        
        // If we start muted, pause the producer immediately
        if (this.isMicMuted()) {
          await this.audioProducer.pause();
        }
      }

      // 2. Video
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !this.isCamOff();
        this.videoProducer = await this.mediasoupService.produce(this.sendTransport!, videoTrack, { source: 'camera' });
        
        // If we start with cam off, pause the producer immediately
        if (this.isCamOff()) {
          await this.videoProducer.pause();
        }
      }

      // 3. Add myself to participants
      const me: Participant = {
        id: this.myId()!,
        name: 'You',
        isMuted: this.isMicMuted(),
        isCamOff: this.isCamOff(),
        initials: 'ME',
        stream: stream
      };

      this.participants.update(prev => [me, ...prev]);
    } catch (err) {
      console.error('Failed to get local media', err);
    }
  }

  async setAllParticipantsResolution(level: string) {
    let layer = 2; // High
    if (level === 'Medium') layer = 1;
    if (level === 'Low') layer = 0;

    for (const consumer of this.consumers.values()) {
      if (consumer.kind === 'video') {
        try {
          await consumer.setPreferredLayers({ spatialLayer: layer });
        } catch (err) {
          console.error('Failed to set preferred layers for consumer', consumer.id, err);
        }
      }
    }
  }

  async setParticipantResolution(participantId: string, level: string) {
    // Find the video consumer for this participant
    let targetConsumer: any = null;
    for (const consumer of this.consumers.values()) {
      if (consumer.kind === 'video' && (consumer as any).participantId === participantId) {
        targetConsumer = consumer;
        break;
      }
    }

    if (targetConsumer) {
      let layer = 2;
      if (level === 'Medium') layer = 1;
      if (level === 'Low') layer = 0;

      try {
        await targetConsumer.setPreferredLayers({ spatialLayer: layer });
      } catch (err) {
        console.error('Failed to set preferred layers', err);
      }
    }
  }

  private async consumeProducer(producerId: string, participantId: string) {
    this.signalingService.send('consume', {
      producer_id: producerId,
      rtp_capabilities: this.mediasoupService.rtpCapabilities,
    });

    const data = await this.signalingService.waitFor<ConsumedResponse>('consumed');

    const consumer = await this.mediasoupService.consume(this.recvTransport!, {
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
        if (!p.stream) {
          p.stream = new MediaStream();
        }
        
        p.stream.addTrack(consumer.track);
      }

      return [...list];
    });

    this.signalingService.send('resumeConsumer', { consumer_id: data.consumer_id });
  }

  async toggleMic() {
    const newValue = !this.isMicMuted();
    this.isMicMuted.set(newValue);

    if (this.audioProducer) {
      if (newValue) {
        await this.audioProducer.pause();
        this.audioProducer.track.enabled = false;
      } else {
        await this.audioProducer.resume();
        this.audioProducer.track.enabled = true;
      }
      this.signalingService.send('producerStatusChanged', { 
        producer_id: this.audioProducer.id, 
        status: newValue ? 'paused' : 'resumed' 
      });
    }

    // Update local participant in the list
    this.participants.update(list => {
      const me = list.find(p => p.id === this.myId());
      if (me) me.isMuted = newValue;
      return [...list];
    });
  }

  async toggleCamera() {
    const newValue = !this.isCamOff();
    this.isCamOff.set(newValue);

    if (this.videoProducer) {
      if (newValue) {
        await this.videoProducer.pause();
        this.videoProducer.track.enabled = false;
      } else {
        await this.videoProducer.resume();
        this.videoProducer.track.enabled = true;
      }
      this.signalingService.send('producerStatusChanged', { 
        producer_id: this.videoProducer.id, 
        status: newValue ? 'paused' : 'resumed' 
      });
    }

    // Update local participant in the list
    this.participants.update(list => {
      const me = list.find(p => p.id === this.myId());
      if (me) me.isCamOff = newValue;
      return [...list];
    });
  }

  requestMuteAll() {
    this.signalingService.send('muteAll');
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
      case 'producerStatusChanged':
        this.updateParticipantStatus(data.producer_id, data.status);
        break;
      case 'muteRequest':
        if (!this.isMicMuted()) {
          this.toggleMic();
        }
        break;
    }
  }

  // when a participant turns off thier mic or camera
  private updateParticipantStatus(producerId: string, status: 'paused' | 'resumed') {
    const isPaused = status === 'paused';
    
    // Find which participant this producerId belongs to
    this.participants.update(list => {
      return list.map(p => {
        // We need to know if this producerId is one of the ones we consumed for this participant
        // For a more robust solution, we'd store producerIds in the Participant model
        // but for now, we can check our consumers map
        for (const [consumerId, consumer] of this.consumers.entries()) {
          if (consumer.producerId === producerId) {
            // Found the consumer. Now check if this participant owns the consumer's track
            const hasTrack = p.stream?.getTracks().some(t => t.id === consumer.track.id);
            if (hasTrack) {
              if (consumer.kind === 'audio') p.isMuted = isPaused;
              if (consumer.kind === 'video') p.isCamOff = isPaused;
            }
          }
        }
        return { ...p };
      });
    });
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
    this.signalingService.send('leave');
    this.signalingService.disconnect();
    this.audioProducer?.close();
    this.videoProducer?.close();
    this.sendTransport?.close();
    this.recvTransport?.close();
    this.isJoined.set(false);
    this.participants.set([]);
  }
}
