"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { processAICommand } from "@/lib/api";
import { Bot, Send, Sparkles, ArrowRight } from "lucide-react";

interface Message {
  type: "user" | "bot";
  text: string;
  action?: string;
  page?: string;
}

const SUGGESTIONS = [
  "Create invoice for Gulf Extrusion 1000 AED",
  "Show ledger for Ahmed LLC",
  "Make statement for May",
  "Add payment 500 AED to invoice INV-0001",
  "Show outstanding report",
  "Show VAT report",
  "New invoice",
  "Backup database",
];

export default function AIPage() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      type: "bot",
      text: "Hello! I'm your FinPilot AI assistant. I can help you navigate the system and perform accounting tasks using natural language commands.",
    },
  ]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => { scrollToBottom(); }, [messages]);

  const sendMessage = async (text?: string) => {
    const cmd = text || input.trim();
    if (!cmd) return;
    setInput("");
    setMessages((m) => [...m, { type: "user", text: cmd }]);
    setLoading(true);

    try {
      const res = await processAICommand(cmd);
      const data = res.data;
      setMessages((m) => [...m, {
        type: "bot",
        text: data.message,
        action: data.action,
        page: data.page
      }]);
    } catch {
      setMessages((m) => [...m, { type: "bot", text: "Sorry, I couldn't process that command. Make sure the backend is running." }]);
    } finally {
      setLoading(false);
    }
  };

  const handleNavigate = (page: string) => {
    router.push(page);
  };

  return (
    <div className="flex flex-col h-screen">
      <Header title="AI Command" />
      <div className="flex-1 overflow-hidden flex flex-col p-6 gap-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: "📄", label: "Create Invoice", cmd: "New invoice" },
            { icon: "💰", label: "Record Payment", cmd: "Add payment" },
            { icon: "📊", label: "VAT Report", cmd: "Show VAT report" },
            { icon: "💾", label: "Backup Data", cmd: "Backup database" },
          ].map((a) => (
            <button
              key={a.label}
              onClick={() => sendMessage(a.cmd)}
              className="card flex items-center gap-3 hover:border-brand-indigo/40 transition-all group"
            >
              <span className="text-xl">{a.icon}</span>
              <span className="text-sm font-medium text-text-primary">{a.label}</span>
            </button>
          ))}
        </div>

        {/* Chat window */}
        <div className="card flex-1 overflow-hidden flex flex-col p-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.type === "user" ? "flex-row-reverse" : ""}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.type === "bot" ? "bg-brand-indigo/20" : "bg-bg-border"}`}>
                  {msg.type === "bot" ? <Bot size={16} className="text-brand-indigo" /> : <span className="text-xs font-bold text-text-secondary">U</span>}
                </div>
                <div className={`max-w-lg ${msg.type === "user" ? "items-end" : "items-start"} flex flex-col gap-2`}>
                  <div className={`px-4 py-3 rounded-2xl text-sm ${
                    msg.type === "bot"
                      ? "bg-bg-secondary border border-bg-border text-text-primary rounded-tl-sm"
                      : "bg-brand-indigo text-white rounded-tr-sm"
                  }`}>
                    {msg.text}
                  </div>
                  {msg.page && (
                    <button
                      onClick={() => handleNavigate(msg.page!)}
                      className="flex items-center gap-2 text-xs text-brand-indigo hover:text-brand-glow font-medium"
                    >
                      <ArrowRight size={12} /> Go to page
                    </button>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-brand-indigo/20 flex items-center justify-center">
                  <Bot size={16} className="text-brand-indigo" />
                </div>
                <div className="bg-bg-secondary border border-bg-border px-4 py-3 rounded-2xl rounded-tl-sm">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-brand-indigo rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <div className="w-2 h-2 bg-brand-indigo rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <div className="w-2 h-2 bg-brand-indigo rounded-full animate-bounce" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggestions */}
          <div className="border-t border-bg-border px-4 py-3">
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="flex-shrink-0 text-xs bg-bg-secondary border border-bg-border text-text-secondary hover:text-text-primary hover:border-brand-indigo/40 px-3 py-1.5 rounded-full transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <div className="border-t border-bg-border p-4">
            <form
              onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
              className="flex gap-3"
            >
              <div className="relative flex-1">
                <Sparkles size={15} className="absolute left-3 top-3 text-brand-indigo" />
                <input
                  className="input pl-9 pr-4 h-11"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder='Try: "Create invoice for ABC Company 5000 AED"'
                  disabled={loading}
                />
              </div>
              <button type="submit" disabled={loading || !input.trim()} className="btn-primary px-5 h-11">
                <Send size={15} />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
