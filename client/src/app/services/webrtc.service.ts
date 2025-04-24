// src/app/services/webrtc.service.ts
import { Injectable } from '@angular/core';
// import { io } from 'socket.io-client';
import io from 'socket.io-client';
import { environment } from '../../environments/environment';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class WebRTCService {
  private socket: any;
  private peerConnections: { [key: string]: RTCPeerConnection } = {};
  private localStream: MediaStream | null = null;
  private currentRoom: string | null = null;
  private remoteStreamsSubject = new BehaviorSubject<{ [key: string]: MediaStream }>({});
  public remoteStreams$: Observable<{ [key: string]: MediaStream }> = this.remoteStreamsSubject.asObservable();

  constructor() {
    this.socket = io(environment.socketUrl);
    this.setupSocketListeners();
  }

  private setupSocketListeners(): void {
    this.socket.on('offer', async (data: { sender: string; offer: RTCSessionDescriptionInit }) => {
      if (!this.peerConnections[data.sender]) {
        await this.createPeerConnection(data.sender);
      }
      const pc = this.peerConnections[data.sender];
      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.socket.emit('answer', {
        target: data.sender,
        answer: pc.localDescription
      });
    });

    this.socket.on('answer', async (data: { sender: string; answer: RTCSessionDescriptionInit }) => {
      const pc = this.peerConnections[data.sender];
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      }
    });

    this.socket.on('ice-candidate', (data: { sender: string; candidate: RTCIceCandidateInit }) => {
      const pc = this.peerConnections[data.sender];
      if (pc) {
        pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    });

    this.socket.on('newUserJoined', (userId: string) => {
      this.createPeerConnection(userId).then(() => {
        this.initiateOffer(userId);
      });
    });

    this.socket.on('userLeft', (userId: string) => {
      this.cleanupPeerConnection(userId);
    });
  }

  async createRoom(): Promise<string> {
    return new Promise((resolve) => {
      const roomId = Math.random().toString(36).substring(2, 8);
      this.socket.emit('createRoom', roomId, (success: boolean) => {
        if (success) {
          this.currentRoom = roomId;
          resolve(roomId);
        } else {
          resolve('');
        }
      });
    });
  }

  async joinRoom(roomId: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.socket.emit('joinRoom', roomId, (success: boolean) => {
        if (success) {
          this.currentRoom = roomId;
          resolve(true);
        } else {
          resolve(false);
        }
      });
    });
  }

  async startLocalStream(): Promise<MediaStream> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      return this.localStream;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      throw error;
    }
  }

  stopLocalStream(): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
  }

  private async createPeerConnection(userId: string): Promise<RTCPeerConnection> {
    if (this.peerConnections[userId]) {
      return this.peerConnections[userId];
    }

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    });

    this.peerConnections[userId] = pc;

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream!);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('ice-candidate', {
          target: userId,
          candidate: event.candidate
        });
      }
    };

    pc.ontrack = (event) => {
      const remoteStream = new MediaStream();
      event.streams[0].getTracks().forEach(track => {
        remoteStream.addTrack(track);
      });
      
      const currentRemoteStreams = this.remoteStreamsSubject.value;
      this.remoteStreamsSubject.next({
        ...currentRemoteStreams,
        [userId]: remoteStream
      });
    };

    return pc;
  }

  private async initiateOffer(userId: string): Promise<void> {
    const pc = this.peerConnections[userId];
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.socket.emit('offer', {
      target: userId,
      offer: pc.localDescription
    });
  }

  private cleanupPeerConnection(userId: string): void {
    const pc = this.peerConnections[userId];
    if (pc) {
      pc.close();
      delete this.peerConnections[userId];
      
      const currentRemoteStreams = this.remoteStreamsSubject.value;
      if (currentRemoteStreams[userId]) {
        const newRemoteStreams = { ...currentRemoteStreams };
        delete newRemoteStreams[userId];
        this.remoteStreamsSubject.next(newRemoteStreams);
      }
    }
  }

  leaveRoom(): void {
    if (this.currentRoom) {
      this.socket.emit('leaveRoom', this.currentRoom);
      this.currentRoom = null;
    }
    Object.keys(this.peerConnections).forEach(userId => {
      this.cleanupPeerConnection(userId);
    });
  }

  getCurrentRoom(): string | null {
    return this.currentRoom;
  }
}