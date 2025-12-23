import type { FastifyInstance, FastifyRequest } from 'fastify';

export type Role = 'host' | 'guest';

type StudioPeer = {
  peerId: string;
  role: Role;
  socket: any;
};

// roomId -> peerId -> peer
const rooms = new Map<string, Map<string, StudioPeer>>();

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
  _req: FastifyRequest
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
        const { roomId, peerId, role } = msg;
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
        break;
      }

      case 'signal': {
        const { roomId, peerId, targetPeerId, payload } = msg;
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
          fromPeerId: peerId,
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
            if (other.peerId !== peerId) {
              safeSend(other.socket, signalMsg);
            }
          }
        }
        break;
      }

      case 'leave': {
        const { roomId, peerId } = msg;
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
