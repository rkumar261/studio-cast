'use client';

import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '@/lib/api'; 

export type WebSocketStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

type WebSocketHandlers = {
  onOpen?: (event: Event, socket: WebSocket) => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (event: Event) => void;
  onMessage?: (data: any, event: MessageEvent) => void;
};

// Derive ws base from the HTTP
const WS_BASE = API_BASE.replace(/^http/, 'ws');

/**
 * Build WS URL to backend using the same origin/port as API_BASE.
 * Example:
 *   API_BASE = http://localhost:8080
 *   path     = /v1/studio/signaling
 *   => ws://localhost:8080/v1/studio/signaling
 */
function buildWebSocketUrl(path: string): string {
  return `${WS_BASE.replace(/\/$/, '')}${path}`;
}

export function useWebSocketConnection(
  path: string,
  handlers: WebSocketHandlers = {}
) {
  const [status, setStatus] = useState<WebSocketStatus>('idle');
  const wsRef = useRef<WebSocket | null>(null);

  const { onOpen, onClose, onError, onMessage } = handlers;

  useEffect(() => {
    // cleanup on unmount
    return () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.close();
        } catch {
          /* ignore */
        }
      }
      wsRef.current = null;
    };
  }, []);

  function connect() {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      // already open
      return;
    }

    const url = buildWebSocketUrl(path);
    console.log('[WS] connecting to', url);

    try {
      const socket = new WebSocket(url);
      wsRef.current = socket;
      setStatus('connecting');

      socket.onopen = (event) => {
        setStatus('open');
        onOpen?.(event, socket);
      };

      socket.onmessage = (event) => {
        if (!onMessage) return;
        try {
          const data = JSON.parse(event.data);
          onMessage(data, event);
        } catch {
          onMessage(event.data, event);
        }
      };

      socket.onerror = (event) => {
        console.error('[WS] error', event);
        setStatus('error');
        onError?.(event);
      };

      socket.onclose = (event) => {
        console.log('[WS] closed', event.code, event.reason);
        setStatus('closed');
        wsRef.current = null;
        onClose?.(event);
      };
    } catch (err) {
      console.error('[WS] failed to open connection', err);
      setStatus('error');
    }
  }

  function disconnect() {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
    wsRef.current = null;
    setStatus('closed');
  }

  function sendJson(payload: any) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn('[WS] not open, cannot send');
      return;
    }
    try {
      ws.send(JSON.stringify(payload));
    } catch (err) {
      console.error('[WS] send failed', err);
    }
  }

  return {
    status,
    socket: wsRef.current,
    connect,
    disconnect,
    sendJson,
  };
}
