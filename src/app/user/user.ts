import { Component, input, signal, ElementRef, effect, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-user',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './user.html',
  styleUrl: './user.css',
})
export class User {
  videoPlayer = viewChild<ElementRef<HTMLVideoElement>>('videoPlayer');

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
      const player = this.videoPlayer();
      if (player && stream) {
        player.nativeElement.srcObject = stream;
        player.nativeElement.play().catch(err => console.warn('Autoplay prevented', err));
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
