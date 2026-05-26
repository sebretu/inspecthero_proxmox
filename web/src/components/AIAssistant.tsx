"use client";
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getToken } from '@/lib/apiClient';
import { Bot, Sparkles, Send, X, Trash2 } from 'lucide-react';


interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function AIAssistant({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const token = await getToken();
      const response = await fetch('/api/admin/ai-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message: userMessage }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to fetch AI response');
      }

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      let assistantMessage = '';
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        assistantMessage += chunk;
        
        // Check for specific error message in the stream if it's the first chunk
        if (assistantMessage.includes('insufficient_quota')) {
          throw new Error('Twój klucz OpenAI nie ma środków (Insufficient Quota). Doładuj konto w panelu OpenAI.');
        }

        setMessages((prev) => {
          const newMessages = [...prev];
          const lastIndex = newMessages.length - 1;
          newMessages[lastIndex] = { ...newMessages[lastIndex], content: assistantMessage };
          return newMessages;
        });
      }
    } catch (error: any) {
      console.error('AI Error:', error);
      let errorMsg = error.message || 'Nie udało się połączyć z AI.';
      if (errorMsg.includes('insufficient_quota')) {
        errorMsg = 'Błąd: Przekroczono limit (Quota) na kluczu OpenAI. Doładuj konto.';
      }
      setMessages((prev) => {
        const newMsgs = [...prev];
        if (newMsgs[newMsgs.length - 1]?.role === 'assistant' && newMsgs[newMsgs.length - 1]?.content === '') {
          newMsgs[newMsgs.length - 1].content = errorMsg;
          return newMsgs;
        }
        return [...prev, { role: 'assistant', content: errorMsg }];
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 3000,
              backgroundColor: 'rgba(0,0,0,0.4)',
              backdropFilter: 'blur(4px)',
            }}
          />
          
          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 h-full w-full max-w-md z-[3001] bg-ui-nav-bg border-l border-ui-border shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="p-6 border-b border-ui-border flex items-center justify-between bg-gradient-to-r from-blue-600/10 to-purple-600/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg border border-white/20">
                  <Bot className="w-6 h-6 text-white" />
                </div>

                <div>
                  <h3 className="font-black text-lg leading-tight text-ui-text tracking-tight uppercase">AI Assistant</h3>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors text-ui-muted hover:text-ui-text"
              >
                <X size={20} />
              </button>

            </div>

            {/* Chat History */}
            <div 
              ref={scrollRef}
              className="flex-grow overflow-y-auto p-6 space-y-6 scroll-smooth"
            >
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-40 space-y-4">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center border border-indigo-500/10 shadow-inner">
                    <Sparkles className="w-10 h-10 text-indigo-400" />
                  </div>

                  <div className="space-y-1">
                    <p className="text-sm font-bold text-ui-text">Witaj w AI Admin Support</p>
                    <p className="text-xs text-ui-muted">Zadaj pytanie dotyczące projektów lub raportów.</p>
                  </div>
                </div>
              )}
              {messages.map((msg, i) => (
                <div 
                  key={i} 
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[90%] p-4 rounded-2xl shadow-sm ${
                    msg.role === 'user' 
                      ? 'bg-ui-accent text-white rounded-tr-none' 
                      : 'bg-ui-card border border-ui-border text-ui-text rounded-tl-none'
                  }`}>
                    <p className="text-[13px] leading-relaxed whitespace-pre-wrap font-medium">{msg.content}</p>
                  </div>
                </div>
              ))}
              {isLoading && messages[messages.length-1]?.role === 'user' && (
                <div className="flex justify-start">
                  <div className="bg-ui-card border border-ui-border p-4 rounded-2xl rounded-tl-none shadow-sm">
                    <div className="flex gap-1.5">
                      <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1 }} className="w-2 h-2 bg-ui-accent rounded-full" />
                      <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-2 h-2 bg-ui-accent rounded-full" />
                      <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-2 h-2 bg-ui-accent rounded-full" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input Area */}
            <div className="p-6 border-t border-ui-border bg-ui-bg/30 backdrop-blur-md">
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Wpisz wiadomość..."
                  className="w-full bg-ui-card border border-ui-border focus:border-ui-accent/50 focus:ring-2 focus:ring-ui-accent/10 rounded-xl py-4 pl-5 pr-14 outline-none transition-all placeholder:text-ui-muted text-sm font-medium"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className="absolute right-2.5 w-10 h-10 bg-ui-accent hover:bg-ui-accent/80 disabled:opacity-30 disabled:grayscale text-white rounded-lg flex items-center justify-center transition-all shadow-lg active:scale-95"
                >
                  <Send size={18} />
                </button>

              </div>
              <div className="mt-4 flex justify-between items-center px-1">
                  <button 
                    onClick={() => setMessages([])}
                    className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.15em] text-ui-muted hover:text-red-500 transition-colors group"
                  >
                    <Trash2 size={10} className="group-hover:animate-bounce" />
                    Wyczyść czat
                  </button>

                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  <p className="text-[9px] text-ui-muted font-bold uppercase tracking-widest">AI Online</p>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
