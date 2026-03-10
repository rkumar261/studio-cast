import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { RequestPrincipal } from '../lib/request-principal.js';
import { emitTelemetry } from '../lib/telemetry.js';

export type Role = 'host' | 'guest';

type StudioPeer = {
  peerId: string;
  role: Role;
  socket: any;
};

// roomId -> peerId -> peer
const rooms = new Map<string, Map<string, StudioPeer>>();

function safeSendRaw(target: any, msg: unknown) {
  try {
    target.send(JSON.stringify(msg));
  } catch {
    // ignore send failures for disconnected sockets
  }
}

export function broadcastStudioRoomEvent(roomId: string, msg: unknown): { peers: number; sent: number } {
  const room = rooms.get(roomId);
  if (!room) return { peers: 0, sent: 0 };

  let sent = 0;
  for (const peer of room.values()) {
    safeSendRaw(peer.socket, msg);
    sent += 1;
  }
  return { peers: room.size, sent };
}

type ClientToServerMessage =
  | {
    type: 'join';
    roomId: string;
    peerId: string;
    role: Role;
  }
  | {
    type: 'signal';
    roomId: string;
    peerId: string;
    targetPeerId?: string;
    payload: any;
  }
  | {
    type: 'leave';
    roomId: string;
    peerId: string;
  };

// NOTE: second arg can be either { socket } or the raw ws,
// we normalize it inside.
export function handleStudioWsConnection(
  app: FastifyInstance,
  connectionOrSocket: any,
  _req: FastifyRequest,
  principal: RequestPrincipal
) {
  // Support both shapes: { socket: ws } OR ws directly
  const ws =
    connectionOrSocket && connectionOrSocket.socket
      ? connectionOrSocket.socket
      : connectionOrSocket;

  if (!ws || typeof ws.on !== 'function') {
    app.log.error(
      { got: connectionOrSocket },
      '[studio-websocket] ws instance missing or invalid'
    );
    return;
  }

  let currentRoomId: string | null = null;
  let currentPeerId: string | null = null;

  const logPrefix = '[studio-websocket]';

  function safeSend(target: any, msg: unknown) {
    try {
      target.send(JSON.stringify(msg));
    } catch (err) {
      app.log.warn({ err }, `${logPrefix} failed to send message`);
    }
  }

  ws.on('message', (raw: Buffer) => {
    let msg: ClientToServerMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      safeSend(ws, {
        type: 'error',
        message: 'Invalid JSON payload',
      });
      return;
    }

    if (!msg || typeof msg !== 'object' || typeof (msg as any).type !== 'string') {
      safeSend(ws, {
        type: 'error',
        message: 'Invalid message format',
      });
      return;
    }

    switch (msg.type) {
      case 'join': {
        const { roomId } = msg;
        if (principal.kind === 'guest' && roomId !== principal.recordingId) {
          safeSend(ws, { type: 'error', roomId, message: 'Guest is out of room scope' });
          try {
            ws.close(1008, 'Forbidden');
          } catch {
            /* ignore */
          }
          return;
        }

        const peerId = principal.kind === 'guest' ? principal.participantId : msg.peerId;
        const role: Role = principal.kind === 'guest' ? 'guest' : msg.role;
        currentRoomId = roomId;
        currentPeerId = peerId;

        let room = rooms.get(roomId);
        if (!room) {
          room = new Map();
          rooms.set(roomId, room);
        }

        const peer: StudioPeer = { peerId, role, socket: ws };
        room.set(peerId, peer);

        const existingPeers = Array.from(room.values())
          .filter((p) => p.peerId !== peerId)
          .map((p) => ({ peerId: p.peerId, role: p.role }));

        safeSend(ws, {
          type: 'joined',
          roomId,
          peerId,
          role,
          peers: existingPeers,
        });

        const joinedMsg = {
          type: 'peer-joined',
          roomId,
          peerId,
          role,
        } as const;

        for (const other of room.values()) {
          if (other.peerId !== peerId) {
            safeSend(other.socket, joinedMsg);
          }
        }

        app.log.info({ roomId, peerId, role }, `${logPrefix} peer joined room`);
        if (role === 'guest') {
          emitTelemetry({
            logger: app.log,
            event: 'guest.joined.session',
            message: 'Guest joined live recording session',
            recordingId: roomId,
            sessionId: roomId,
            participantId: peerId,
            role,
          });
        }
        break;
      }

      case 'signal': {
        const { roomId, targetPeerId, payload } = msg;
        if (principal.kind === 'guest' && roomId !== principal.recordingId) {
          safeSend(ws, { type: 'error', roomId, message: 'Guest is out of room scope' });
          return;
        }

        const fromPeerId = principal.kind === 'guest' ? principal.participantId : msg.peerId;
        const room = rooms.get(roomId);
        if (!room) {
          safeSend(ws, {
            type: 'error',
            roomId,
            message: 'Room not found for signal',
          });
          return;
        }

        const signalMsg = {
          type: 'signal',
          roomId,
          fromPeerId,
          payload,
        } as const;

        if (targetPeerId) {
          const target = room.get(targetPeerId);
          if (target) {
            safeSend(target.socket, signalMsg);
          } else {
            safeSend(ws, {
              type: 'error',
              roomId,
              message: `Target peer ${targetPeerId} not found`,
            });
          }
        } else {
          for (const other of room.values()) {
            if (other.peerId !== fromPeerId) {
              safeSend(other.socket, signalMsg);
            }
          }
        }
        break;
      }

      case 'leave': {
        const { roomId } = msg;
        if (principal.kind === 'guest' && roomId !== principal.recordingId) {
          safeSend(ws, { type: 'error', roomId, message: 'Guest is out of room scope' });
          return;
        }

        const peerId = principal.kind === 'guest' ? principal.participantId : msg.peerId;
        const room = rooms.get(roomId);
        if (!room) return;

        room.delete(peerId);

        const leftMsg = {
          type: 'peer-left',
          roomId,
          peerId,
        } as const;

        for (const other of room.values()) {
          safeSend(other.socket, leftMsg);
        }

        if (room.size === 0) {
          rooms.delete(roomId);
        }

        app.log.info(
          { roomId, peerId },
          `${logPrefix} peer left room via message`
        );
        break;
      }

      default: {
        safeSend(ws, {
          type: 'error',
          message: `Unknown message type ${(msg as any).type}`,
        });
      }
    }
  });

  ws.on('close', () => {
    if (!currentRoomId || !currentPeerId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    room.delete(currentPeerId);

    const leftMsg = {
      type: 'peer-left',
      roomId: currentRoomId,
      peerId: currentPeerId,
    } as const;

    for (const other of room.values()) {
      safeSend(other.socket, leftMsg);
    }

    if (room.size === 0) {
      rooms.delete(currentRoomId);
    }

    app.log.info(
      { roomId: currentRoomId, peerId: currentPeerId },
      `${logPrefix} peer disconnected`
    );
  });
}
