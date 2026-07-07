import { Room } from './Room';
import { generateCode } from './codes';

const SWEEP_INTERVAL_MS = 30_000;

export class RoomManager {
  private rooms = new Map<string, Room>();

  constructor() {
    const interval = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    interval.unref();
  }

  create(): Room {
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = generateCode();
      if (!this.rooms.has(code)) {
        const room = new Room(code);
        this.rooms.set(code, room);
        return room;
      }
    }
    throw new Error('could not allocate a room code');
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  private sweep(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      room.sweep(now);
      if (room.isAbandoned(now)) {
        room.close('room closed for inactivity');
        this.rooms.delete(code);
      }
    }
  }
}
