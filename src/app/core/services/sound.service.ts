import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class SoundService {
  private joinSound = new Audio('/audio/connected.wav');

  constructor() {
    this.joinSound.load();
  }

  playJoin() {
    this.joinSound.currentTime = 0;
    this.joinSound.play().catch(err => console.warn('Sound playback blocked by browser', err));
  }
}
