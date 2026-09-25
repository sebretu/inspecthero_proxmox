"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Bot,
  Send,
  X,
  Sparkles,
  Trash2,
  Mic,
  Square,
  Copy,
  Check,
  Loader2,
  ImageIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getToken } from "@/lib/apiClient";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface Message {
  role: "user" | "assistant";
  content: string;
  image?: string;
}

export function AIAssistant({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [previewImageModal, setPreviewImageModal] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, selectedImage]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const handleCopyMessage = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (e) {
      console.error("Failed to copy", e);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Proszę wybrać plik graficzny (JPG, PNG, WEBP).");
      return;
    }

    if (file.size > 12 * 1024 * 1024) {
      alert("Rozmiar pliku nie może przekraczać 12 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setSelectedImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Reset input value so same file can be re-selected if needed
    e.target.value = "";
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            setSelectedImage(event.target?.result as string);
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    }
  };

  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Twoja przeglądarka nie obsługuje nagrywania dźwięku.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      let mimeType = "audio/webm";
      if (!MediaRecorder.isTypeSupported("audio/webm")) {
        if (MediaRecorder.isTypeSupported("audio/mp4")) mimeType = "audio/mp4";
        else if (MediaRecorder.isTypeSupported("audio/ogg")) mimeType = "audio/ogg";
        else mimeType = "";
      }

      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        if (audioChunksRef.current.length === 0) return;

        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || "audio/webm" });
        await transcribeAudio(audioBlob);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(250);
      setIsRecording(true);
      setRecordingSeconds(0);

      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error("Microphone access error:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        alert("Brak uprawnień do mikrofonu. Zezwól na dostęp do mikrofonu w przeglądarce.");
      } else {
        alert(`Błąd mikrofonu: ${err.message || "Nie udało się uruchomić nagrywania."}`);
      }
    }
  };

  const stopRecording = (cancel = false) => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      if (cancel) {
        audioChunksRef.current = [];
      }
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setRecordingSeconds(0);
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    try {
      const token = await getToken();
      if (!token) {
        throw new Error("Brak autoryzacji. Zaloguj się ponownie.");
      }

      const formData = new FormData();
      formData.append("file", audioBlob, "speech.webm");
      formData.append("language", "pl");

      const res = await fetch("/api/admin/ai-voice", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Błąd serwera STT (Status ${res.status})`);
      }

      const data = await res.json();
      if (data.text) {
        setInput((prev) => (prev ? `${prev.trim()} ${data.text.trim()}` : data.text.trim()));
      }
    } catch (err: any) {
      console.error("Transcription error:", err);
      alert(err.message || "Nie udało się rozpoznać mowy.");
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && !selectedImage) || isLoading) return;

    const userText = input.trim();
    const currentImage = selectedImage;

    const newMsg: Message = {
      role: "user",
      content: userText || "Przeanalizuj załączone zdjęcie.",
      image: currentImage || undefined,
    };

    const updatedMessages: Message[] = [...messages, newMsg];

    setInput("");
    setSelectedImage(null);
    setMessages(updatedMessages);
    setIsLoading(true);

    try {
      const token = await getToken();
      if (!token) {
        throw new Error("Brak autoryzacji. Zaloguj się ponownie.");
      }

      const response = await fetch("/api/admin/ai-stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: updatedMessages,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Błąd serwera AI (Status ${response.status})`);
      }

      if (!response.body) {
        throw new Error("Brak strumienia danych w odpowiedzi.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let assistantMessage = "";
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        assistantMessage += chunk;

        if (assistantMessage.includes("insufficient_quota")) {
          throw new Error("Twój klucz OpenAI nie ma środków (Insufficient Quota). Doładuj konto w panelu OpenAI.");
        }

        setMessages((prev) => {
          const newMessages = [...prev];
          const lastIndex = newMessages.length - 1;
          newMessages[lastIndex] = { ...newMessages[lastIndex], content: assistantMessage };
          return newMessages;
        });
      }
    } catch (error: any) {
      console.error("AI Error:", error);
      let errorMsg = error.message || "Nie udało się połączyć z AI.";
      if (errorMsg.includes("insufficient_quota")) {
        errorMsg = "Błąd: Przekroczono limit (Quota) na kluczu OpenAI. Doładuj konto.";
      }
      setMessages((prev) => {
        const newMsgs = [...prev];
        if (newMsgs[newMsgs.length - 1]?.role === "assistant" && newMsgs[newMsgs.length - 1]?.content === "") {
          newMsgs[newMsgs.length - 1].content = errorMsg;
          return newMsgs;
        }
        return [...prev, { role: "assistant", content: errorMsg }];
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
              position: "fixed",
              inset: 0,
              zIndex: 200000,
              backgroundColor: "rgba(0,0,0,0.4)",
              backdropFilter: "blur(4px)",
            }}
          />

          {/* Full-size Image Preview Modal */}
          {previewImageModal && (
            <div
              className="fixed inset-0 z-[200010] bg-black/80 flex items-center justify-center p-4"
              onClick={() => setPreviewImageModal(null)}
            >
              <div className="relative max-w-2xl max-h-[85vh] overflow-hidden rounded-2xl border border-white/20 shadow-2xl bg-black">
                <button
                  onClick={() => setPreviewImageModal(null)}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/90 transition-colors z-10"
                >
                  <X size={18} />
                </button>
                <img
                  src={previewImageModal}
                  alt="Podgląd pełny"
                  className="w-full h-full object-contain max-h-[80vh]"
                />
              </div>
            </div>
          )}

          {/* Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            onPaste={handlePaste}
            className="fixed top-0 right-0 h-full w-full max-w-lg z-[200001] bg-ui-nav-bg border-l border-ui-border shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-ui-border flex items-center justify-between bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-transparent">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg border border-white/20">
                  <Bot className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-black text-base leading-tight text-ui-text tracking-tight uppercase">
                    AI Assistant
                  </h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] text-ui-muted font-bold tracking-wider uppercase">
                      InspectHero AI Core & Vision
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors text-ui-muted hover:text-ui-text"
              >
                <X size={18} />
              </button>
            </div>

            {/* Chat History */}
            <div ref={scrollRef} className="flex-grow overflow-y-auto p-4 sm:p-6 space-y-4 scroll-smooth">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-60 space-y-3 py-12">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center border border-indigo-500/20 shadow-inner">
                    <Sparkles className="w-8 h-8 text-indigo-400" />
                  </div>
                  <div className="space-y-1 max-w-xs">
                    <p className="text-sm font-bold text-ui-text">Witaj w InspectHero AI Assistant</p>
                    <p className="text-xs text-ui-muted">
                      Zadaj pytanie, załącz zdjęcie czujki/tabliczki znamionowej lub podyktuj wiadomość głosowo.
                    </p>
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                  <div
                    className={`max-w-[92%] p-3.5 sm:p-4 rounded-2xl shadow-sm group relative ${
                      msg.role === "user"
                        ? "bg-ui-accent text-white rounded-tr-none"
                        : "bg-ui-card border border-ui-border text-ui-text rounded-tl-none"
                    }`}
                  >
                    {/* Attached Image inside user bubble */}
                    {msg.image && (
                      <div className="mb-2.5 overflow-hidden rounded-xl border border-white/20 max-w-[260px]">
                        <img
                          src={msg.image}
                          alt="Załącznik"
                          onClick={() => setPreviewImageModal(msg.image || null)}
                          className="w-full h-auto object-cover max-h-48 cursor-pointer hover:opacity-90 transition-opacity"
                        />
                      </div>
                    )}

                    {msg.role === "assistant" ? (
                      <MarkdownRenderer content={msg.content} />
                    ) : (
                      <p className="text-[13px] leading-relaxed whitespace-pre-wrap font-medium">{msg.content}</p>
                    )}

                    {/* Copy Button */}
                    {msg.role === "assistant" && msg.content && (
                      <div className="mt-2 pt-2 border-t border-ui-border/40 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleCopyMessage(msg.content, i)}
                          className="flex items-center gap-1 text-[10px] text-ui-muted hover:text-ui-text transition-colors px-1.5 py-0.5 rounded hover:bg-white/5"
                        >
                          {copiedIndex === i ? (
                            <>
                              <Check size={11} className="text-green-400" />
                              <span className="text-green-400">Skopiowano</span>
                            </>
                          ) : (
                            <>
                              <Copy size={11} />
                              <span>Kopiuj odpowiedź</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isLoading && messages[messages.length - 1]?.role === "user" && (
                <div className="flex justify-start">
                  <div className="bg-ui-card border border-ui-border p-3.5 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-ui-accent animate-spin" />
                    <span className="text-xs text-ui-muted font-medium">Asystent analizuje i przygotowuje odpowiedź...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Hidden file input for images */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />

            {/* Input & Voice Recording Area */}
            <div className="p-4 border-t border-ui-border bg-ui-bg/40 backdrop-blur-md space-y-2.5">
              {/* Image Preview Thumbnail before sending */}
              {selectedImage && (
                <div className="relative inline-flex items-center gap-2 p-1.5 bg-ui-card border border-ui-border rounded-xl shadow-md">
                  <img
                    src={selectedImage}
                    alt="Wybrany obraz"
                    onClick={() => setPreviewImageModal(selectedImage)}
                    className="w-14 h-14 object-cover rounded-lg cursor-pointer border border-white/10"
                  />
                  <div className="text-[11px] text-ui-muted pr-6">
                    <p className="font-semibold text-ui-text">Załączono obraz</p>
                    <p className="text-[10px]">Kliknij aby powiększyć</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedImage(null)}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-red-500/80 hover:bg-red-500 text-white flex items-center justify-center transition-colors shadow"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}

              {isRecording ? (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center justify-between animate-pulse">
                  <div className="flex items-center gap-2.5">
                    <span className="w-3 h-3 rounded-full bg-red-500 animate-ping" />
                    <span className="text-xs font-bold text-red-400 uppercase tracking-wider">
                      Nagrywanie ({recordingSeconds}s)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => stopRecording(true)}
                      className="px-2.5 py-1 text-xs text-ui-muted hover:text-white bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                    >
                      Anuluj
                    </button>
                    <button
                      type="button"
                      onClick={() => stopRecording(false)}
                      className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-md"
                    >
                      <Square size={12} fill="white" />
                      Zakończ i wstaw
                    </button>
                  </div>
                </div>
              ) : isTranscribing ? (
                <div className="p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-xl flex items-center justify-center gap-2 text-indigo-400 text-xs font-medium">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Przetwarzanie głosu przez Local AI (Whisper)...
                </div>
              ) : (
                <div className="relative flex items-center gap-1.5">
                  <div className="relative flex-grow">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      placeholder={selectedImage ? "Zadaj pytanie o to zdjęcie..." : "Napisz pytanie, załącz obraz lub mów..."}
                      className="w-full bg-ui-card border border-ui-border focus:border-ui-accent/50 focus:ring-2 focus:ring-ui-accent/10 rounded-xl py-3.5 pl-4 pr-18 outline-none transition-all placeholder:text-ui-muted text-sm font-medium text-ui-text"
                    />

                    {/* Action buttons inside input right */}
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        title="Załącz zdjęcie / schemat (Vision/OCR)"
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-ui-muted hover:text-ui-accent hover:bg-ui-accent/10 transition-colors"
                      >
                        <ImageIcon size={17} />
                      </button>

                      <button
                        type="button"
                        onClick={startRecording}
                        title="Nagraj wiadomość głosowo (Whisper STT)"
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-ui-muted hover:text-ui-accent hover:bg-ui-accent/10 transition-colors"
                      >
                        <Mic size={17} />
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={(!input.trim() && !selectedImage) || isLoading}
                    className="w-11 h-11 bg-ui-accent hover:bg-ui-accent/90 disabled:opacity-30 disabled:grayscale text-white rounded-xl flex items-center justify-center transition-all shadow-lg active:scale-95 flex-shrink-0"
                  >
                    <Send size={18} />
                  </button>
                </div>
              )}

              {/* Bottom bar */}
              <div className="flex justify-between items-center px-1 text-[10px]">
                <button
                  type="button"
                  onClick={() => setMessages([])}
                  className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-ui-muted hover:text-red-400 transition-colors"
                >
                  <Trash2 size={11} />
                  Wyczyść czat
                </button>

                <span className="text-ui-muted font-medium">
                  {messages.length > 0 ? `${messages.length} wiadomości w sesji` : "Wklej obraz (Ctrl+V) lub wybierz plik"}
                </span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
