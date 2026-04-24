import { Component, signal, OnInit, ElementRef, viewChild, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MeetingService } from '../core/services/meeting.service';

@Component({
  selector: 'app-waiting-room',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './waiting-room.html',
  styleUrl: './waiting-room.css'
})
export default class WaitingRoom implements OnInit {
  private _meetingService = inject(MeetingService)
  private _router = inject(Router);
  
  previewVideo = viewChild<ElementRef<HTMLVideoElement>>('previewVideo');
  roomId = input<string>();
  userName = signal('');
  isMicMuted = signal(true);
  isCameraOff = signal(true);
  localStream: MediaStream | null = null;

  async ngOnInit() {
    if (!this.roomId()) {
      this._router.navigate(['/']);
    }
  }

  async startPreview() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: !this.isMicMuted(),
        video: !this.isCameraOff() ? { width: 1280, height: 720 } : false
      });

      if (this.previewVideo()) {
        this.previewVideo()!.nativeElement.srcObject = this.localStream;
      }

    } catch (err) {
      console.error('Failed to get local stream', err);
    }
  }

  toggleMic() {
    this.isMicMuted.set(!this.isMicMuted());
    this.startPreview();
  }

  toggleCamera() {
    this.isCameraOff.set(!this.isCameraOff());
    this.startPreview();
  }

  joinMeeting() {
    if (!this.userName().trim()) {
      return;
    }

    
    this.localStream?.getTracks().forEach(track => track.stop());

    this._meetingService.isCamOff.set(this.isCameraOff());
    this._meetingService.isMicMuted.set(this.isMicMuted());

    this._router.navigate(['/meeting', this.roomId()], {
          queryParams: { name: this.userName() }
      });
    }
  
}
