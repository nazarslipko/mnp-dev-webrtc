
import { Component, OnInit, OnDestroy } from '@angular/core';
import { WebRTCService } from '../services/webrtc.service';

@Component({
  selector: 'app-video-chat',
  standalone: false,
  templateUrl: './video-chat.component.html',
  styleUrls: ['./video-chat.component.scss']
})
export class VideoChatComponent implements OnInit, OnDestroy {
  localStream: MediaStream | null = null;
  remoteStreams: Record<string, MediaStream> = {};
  roomId: string = '';
  isInRoom: boolean = false;
  isRoomCreator: boolean = false;
  errorMessage: string = '';

  constructor(private webRTCService: WebRTCService) {}

  async ngOnInit(): Promise<void> {
    try {
      this.localStream = await this.webRTCService.startLocalStream();
    } catch (error) {
      this.errorMessage = 'Could not access camera/microphone. Please check permissions.';
      console.error(error);
    }

    this.webRTCService.remoteStreams$.subscribe(streams => {
      this.remoteStreams = streams;
    });
  }

  async createRoom(): Promise<void> {
    try {
      this.roomId = await this.webRTCService.createRoom();
      this.isInRoom = true;
      this.isRoomCreator = true;
      this.errorMessage = '';
    } catch (error) {
      this.errorMessage = 'Failed to create room. Please try again.';
      console.error(error);
    }
  }

  async joinRoom(): Promise<void> {
    if (!this.roomId) {
      this.errorMessage = 'Please enter a room ID';
      return;
    }

    try {
      const success = await this.webRTCService.joinRoom(this.roomId);
      if (success) {
        this.isInRoom = true;
        this.isRoomCreator = false;
        this.errorMessage = '';
      } else {
        this.errorMessage = 'Room not found or is full';
      }
    } catch (error) {
      this.errorMessage = 'Failed to join room. Please try again.';
      console.error(error);
    }
  }

  leaveRoom(): void {
    this.webRTCService.leaveRoom();
    this.isInRoom = false;
    this.isRoomCreator = false;
    this.roomId = '';
  }

  ngOnDestroy(): void {
    this.webRTCService.leaveRoom();
    this.webRTCService.stopLocalStream();
  }

  getRemoteStreams(): MediaStream[] {
    return Object.values(this.remoteStreams);
  }
}