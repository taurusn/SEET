"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { cn, timeAgo } from "@/lib/utils";
import { Bot, User, Plus, Trash2, Send, Loader2, FlaskConical } from "lucide-react";

interface Conversation {
  id: string;
  platform: string;
  customer_id: string;
  status: string;
  created_at: string;
}

interface Message {
  id: string;
  conversation_id: string;
  direction: string;
  content: string;
  sender_type: string | null;
  status: string;
  created_at: string;
}

interface ChatResponse {
  user_message: Message;
  ai_message: Message;
  handoff_detected: boolean;
}

export default function PlaygroundPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);

  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch conversations on mount
  useEffect(() => {
    api
      .get<Conversation[]>("/api/v1/shop/playground/conversations")
      .then(setConversations)
      .finally(() => setListLoading(false));
  }, []);

  // Fetch messages when selecting a conversation
  useEffect(() => {
    if (!selectedId) return;
    setMessagesLoading(true);
    api
      .get<Message[]>(
        `/api/v1/shop/conversations/${selectedId}/messages?limit=200`
      )
      .then(setMessages)
      .catch(() => setMessages([]))
      .finally(() => setMessagesLoading(false));
  }, [selectedId]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleNewChat() {
    const convo = await api.post<Conversation>(
      "/api/v1/shop/playground/conversations"
    );
    setConversations((prev) => [convo, ...prev]);
    setSelectedId(convo.id);
    setMessages([]);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !selectedId || sending) return;

    const text = input.trim();
    setInput("");
    setSending(true);

    try {
      const res = await api.post<ChatResponse>(
        "/api/v1/shop/playground/chat",
        { conversation_id: selectedId, message: text }
      );
      setMessages((prev) => [...prev, res.user_message, res.ai_message]);
    } catch {
      setInput(text);
    } finally {
      setSending(false);
    }
  }

  async function handleDelete(id: string) {
    await api.delete(`/api/v1/shop/playground/conversations/${id}`);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
      setMessages([]);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">ملعب الذكاء</h1>
        <p className="text-muted-foreground text-sm mt-1">
          جرّب المساعد الذكي وشوف كيف يرد على عملائك
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Conversation list */}
        <div className="md:col-span-1 bg-card rounded-2xl border border-border shadow-sm overflow-hidden max-h-[70vh] flex flex-col">
          <div className="p-3 border-b border-border">
            <button
              onClick={handleNewChat}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              محادثة جديدة
            </button>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {listLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <FlaskConical className="w-10 h-10 mb-3 opacity-40" />
                <p className="text-sm">أنشئ أول محادثة تجريبية</p>
              </div>
            ) : (
              conversations.map((convo, i) => (
                <div key={convo.id} className="flex items-center group">
                  <button
                    onClick={() => setSelectedId(convo.id)}
                    className={cn(
                      "flex-1 text-right p-4 hover:bg-muted/50 transition-colors",
                      selectedId === convo.id &&
                        "bg-primary/5 border-r-2 border-primary"
                    )}
                  >
                    <p className="text-sm font-medium truncate">
                      محادثة تجريبية {conversations.length - i}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {timeAgo(convo.created_at)}
                    </p>
                  </button>
                  <button
                    onClick={() => handleDelete(convo.id)}
                    className="p-2 ml-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Chat thread */}
        <div className="md:col-span-2 bg-card rounded-2xl border border-border shadow-sm max-h-[70vh] flex flex-col">
          {selectedId ? (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messagesLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Bot className="w-10 h-10 mb-3 opacity-40" />
                    <p className="text-sm">
                      ابدأ المحادثة! اكتب رسالة مثل ما يكتبها عميلك
                    </p>
                  </div>
                ) : (
                  <>
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={cn(
                          "flex gap-2 max-w-[80%]",
                          msg.direction === "inbound"
                            ? "mr-auto flex-row"
                            : "ml-auto flex-row-reverse"
                        )}
                      >
                        <div
                          className={cn(
                            "w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-1",
                            msg.direction === "inbound"
                              ? "bg-muted"
                              : "bg-primary/10"
                          )}
                        >
                          {msg.direction === "inbound" ? (
                            <User className="w-3.5 h-3.5 text-muted-foreground" />
                          ) : (
                            <Bot className="w-3.5 h-3.5 text-primary" />
                          )}
                        </div>
                        <div
                          className={cn(
                            "px-4 py-2.5 rounded-2xl text-sm leading-relaxed",
                            msg.direction === "inbound"
                              ? "bg-muted text-foreground rounded-tr-md"
                              : "bg-primary/10 text-foreground rounded-tl-md"
                          )}
                        >
                          {msg.content}
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              {/* Input bar */}
              <div className="p-4 border-t border-border">
                <form onSubmit={handleSend} className="flex gap-2">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="اكتب رسالة العميل هنا..."
                    disabled={sending}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-50"
                    dir="auto"
                  />
                  <button
                    type="submit"
                    disabled={sending || !input.trim()}
                    className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {sending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <FlaskConical className="w-12 h-12 mb-3 opacity-30" />
              <p className="font-medium">أنشئ محادثة جديدة أو اختر وحدة من القائمة</p>
              <p className="text-sm mt-1 opacity-70">
                جرّب كيف يرد الذكاء الاصطناعي بإعدادات محلّك
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
