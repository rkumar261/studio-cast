'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  const manualCloseRef = useRef(false);
  const handlersRef = useRef<WebSocketHandlers>(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    // cleanup on unmount
    return () => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          manualCloseRef.current = true;
          ws.close(1000, 'unmount');
        } catch {
          /* ignore */
        }
      }
      wsRef.current = null;
    };
  }, []);

  const connect = useCallback(() => {
    // if already open, do nothing
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return;
    }

    const url = buildWebSocketUrl(path);
    console.log('[WS] connecting to', url);

    try {
      const socket = new WebSocket(url);
      wsRef.current = socket;
      manualCloseRef.current = false;
      setStatus('connecting');

      socket.onopen = (event) => {
        console.log('[WS] open');
        setStatus('open');
        handlersRef.current.onOpen?.(event, socket);
      };

      socket.onmessage = (event) => {
        const onMessage = handlersRef.current.onMessage;
        if (!onMessage) return;
        try {
          const data = JSON.parse(event.data);
          onMessage(data, event);
        } catch {
          onMessage(event.data, event);
        }
      };

      socket.onerror = (event) => {
        const ws = event.target as WebSocket;

        // If we're in the middle of a manual close, treat this as noise
        if (manualCloseRef.current && (ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED)) {
          console.log('[WS] error during manual close, ignoring');
          return;
        }

        console.error('[WS] error', {
          readyState: ws.readyState,
          url: ws.url,
        });

        setStatus('error');
        handlersRef.current.onError?.(event);
      };

      socket.onclose = (event) => {
        console.log('[WS] closed', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        });

        setStatus('closed');
        wsRef.current = null;
        manualCloseRef.current = false;
        handlersRef.current.onClose?.(event);
      };
    } catch (err) {
      console.error('[WS] failed to open connection', err);
      setStatus('error');
    }
  }, [path]);

  const disconnect = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        manualCloseRef.current = true;
        ws.close(1000, 'client disconnect');
      } catch {
        /* ignore */
      }
    }
    wsRef.current = null;
    setStatus('closed');
  }, []);

  const sendJson = useCallback((payload: any) => {
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
  }, []);

  return {
    status,
    socket: wsRef.current,
    connect,
    disconnect,
    sendJson,
  };
}
