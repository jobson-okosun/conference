export interface Participant {
  id: string;
  name: string;
  isMuted: boolean;
  isCamOff: boolean;
  initials: string;
  stream?: MediaStream;
}

export interface SignalingMessage {
  type: string;
  data?: any;
}

// Server struct uses snake_case, mapping to camelCase for the app
export interface JoinResponse {
  participant_id: string;
  existing_participants: Array<{
    participant_id: string;
    participant_name: string;
    producers: Array<{
      producer_id: string;
      kind: string;
      app_data: any;
    }>;
  }>;
}

export interface RouterRtpCapabilitiesResponse {
  rtp_capabilities: any;
}

export interface WebRtcTransportResponse {
  transport_id: string;
  ice_parameters: any;
  ice_candidates: any[];
  dtls_parameters: any;
}

export interface ProducedResponse {
  producer_id: string;
}

export interface ConsumedResponse {
  consumer_id: string;
  producer_id: string;
  kind: 'audio' | 'video';
  rtp_parameters: any;
  app_data: any;
}
