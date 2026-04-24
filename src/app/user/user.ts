import { Component, input, signal, ViewChild, ElementRef, effect } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-user',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './user.html',
  styleUrl: './user.css',
})
export class User {
  @ViewChild('videoPlayer') videoPlayer!: ElementRef<HTMLVideoElement>;

  isCurrentUser = input<boolean>(false);
  name = input<string>('Participant');
  isMuted = input<boolean>(false);
  initials = input<string>('P');
  isCamOff = input<boolean>(false);
  stream = input<MediaStream | undefined | null>(null);

  isResolutionMenuOpen = signal(false);
  currentResolution = signal('High');

  constructor() {
    effect(() => {
      const stream = this.stream();
      if (this.videoPlayer && stream) {
        this.videoPlayer.nativeElement.srcObject = stream;
      }
    });
  }

  toggleResolutionMenu() {
    this.isResolutionMenuOpen.set(!this.isResolutionMenuOpen());
  }

  setResolution(res: string) {
    this.currentResolution.set(res);
    this.isResolutionMenuOpen.set(false);
  }
}
