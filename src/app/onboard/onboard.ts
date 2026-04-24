import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

@Component({
  selector: 'app-onboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './onboard.html',
  styleUrl: './onboard.css'
})
export default class Onboard {
  meetingCode = signal('');

  constructor(private router: Router) {}

  createMeeting() {
    const id = Math.random().toString(36).substring(2, 11);
    this.router.navigate(['/preview', id]);
  }

  joinMeeting() {
    if (this.meetingCode().trim()) {
      this.router.navigate(['/preview', this.meetingCode()]);
    }
  }
}
