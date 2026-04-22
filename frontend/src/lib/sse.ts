"use client";

import { useEffect, useRef, useCallback } from "react";

export interface SSEEvent {
  type: string;
  data: Record<string, unknown>;
}

type EventHandler = (event: SSEEvent) => void;

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const RECONNECT_DELAY = 10_000; // 10 seconds

/**
 * React hook for SSE (Server-Sent Events) connection.
 *
 * Connects to the shop's event stream using the JWT token from localStorage.
 * Auto-reconnects on error with a 10s delay.
 * Requests browser notification permission on mount.
 */
export function useSSE(onEvent: EventHandler) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    // Close any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const url = `${API_URL}/api/v1/shop/events?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    // Listen for specific event types
    const eventTypes = [
      "new_message",
      "handoff_triggered",
      "conversation_updated",
      "shop_deactivated",
      "ai_degraded",
    ];

    for (const type of eventTypes) {
      es.addEventListener(type, (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          onEventRef.current({ type, data });
        } catch {
          // ignore malformed events
        }
      });
    }

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;

      // Auto-reconnect after delay
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY);
    };
  }, []);

  useEffect(() => {
    connect();

    // Request notification permission
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
    };
  }, [connect]);
}

/**
 * Show a browser notification for handoff events.
 */
export function notifyHandoff(customerId: string, reason?: string) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("تحويل جديد — عميل يحتاج رد بشري", {
      body: reason || `العميل ${customerId} يحتاج مساعدة`,
      icon: "/seet-logo.png",
      tag: "handoff",
    });
  }
}
