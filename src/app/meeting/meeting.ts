import { Component, signal, computed, inject, OnInit, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { User } from '../user/user';
import { MeetingService } from '../core/services/meeting.service';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-meeting',
  standalone: true,
  imports: [CommonModule, User], 
  templateUrl: './meeting.html',
  styleUrl: './meeting.css'
}) 
export default class Meeting implements OnInit {
  private meetingService = inject(MeetingService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  roomId = input<string>();
  userName = signal('');
  duration = signal('00:00:00');
  
  isJoined = this.meetingService.isJoined;
  isMicMuted = this.meetingService.isMicMuted;
  isCameraOff = this.meetingService.isCamOff;
  isScreenSharing = signal(false);

  participants = this.meetingService.participants;
  myId = this.meetingService.myId;

  isResolutionMenuOpen = signal(false);
  currentResolution = signal('High');
  screenWidth = signal(window.innerWidth);

  async ngOnInit() {
    this.userName.set(this.route.snapshot.queryParamMap.get('name') ?? '');

    try {
      await this.meetingService.join(this.roomId()!, this.userName(), environment.wsUrl);
    } catch (err) {
      console.error('Failed to join meeting', err);
      // Show toast or navigate back
    }

    window.addEventListener('resize', () => {
      this.screenWidth.set(window.innerWidth);
    });
  }

  toggleResolutionMenu() {
    this.isResolutionMenuOpen.set(!this.isResolutionMenuOpen());
  }

  toggleMic() {
    this.meetingService.toggleMic();
  }

  toggleCamera() {
    this.meetingService.toggleCamera();
  }

  shareScreen() {
    this.isScreenSharing.set(!this.isScreenSharing());
    // TODO: Implement screen sharing in service
  }

  leave() {
    this.meetingService.leave();
    this.router.navigate(['/']);
  }

  setResolution(res: string) {
    this.currentResolution.set(res);
    this.isResolutionMenuOpen.set(false);
    this.meetingService.setAllParticipantsResolution(res);
  }

  toggleMuteAll() {
    this.meetingService.requestMuteAll();
  }

  gridStyle = computed(() => {
    const count = this.participants().length;
    const width = this.screenWidth();
    const isMobile = width < 768;
    
    let cols = 1;
    let rows = 1;

    if (isMobile) {
      if (count === 1) { cols = 1; rows = 1; }
      else if (count === 2) { cols = 1; rows = 2; }
      else if (count <= 4) { cols = 2; rows = Math.ceil(count / 2); }
      else { cols = 2; rows = Math.ceil(count / 2); } // Max 2 on mobile
    } else {
      if (count === 1) { cols = 1; rows = 1; }
      else if (count === 2) { cols = 2; rows = 1; }
      else if (count === 3) { cols = 3; rows = 1; }
      else if (count === 4) { cols = 2; rows = 2; }
      else if (count <= 6) { cols = 3; rows = Math.ceil(count / 3); }
      else if (count <= 8) { cols = 4; rows = 2; }
      else if (count <= 10) { cols = 5; rows = 2; }
      else { cols = 5; rows = Math.ceil(count / 5); } // Max 5 in a row
    }

    return {
      'grid-template-columns': `repeat(${cols}, minmax(0, 1fr))`,
      'grid-template-rows': `repeat(${rows}, minmax(0, 1fr))`
    };
  });
}
