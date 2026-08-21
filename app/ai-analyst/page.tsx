"use client";

import { useState } from "react";

const suggestions = [
  "Why did revenue increase this month?",
  "Which customers are driving growth?",
  "What should we focus on next?",
  "Where are we losing money?",
];

const insights = [
  {
    label: "Revenue",
    value: "₹12.8L",
    change: "+18.4%",
  },
  {
    label: "Customer Growth",
    value: "+24.8%",
    change: "Strong",
  },
  {
    label: "Retention",
    value: "84%",
    change: "+6.2%",
  },
];

export default function AIAnalyst() {
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState(false);

  const handleAsk = () => {
    if (!question.trim()) return;
    setAsked(true);
  };

  const askSuggestion = (text: string) => {
    setQuestion(text);
    setAsked(false);
  };

  return (
    <main className="min-h-screen bg-[#07090d] text-white">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-orange-500/[0.08] blur-[140px]" />

        <div className="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full bg-emerald-500/[0.06] blur-[140px]" />

        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,.4) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,.4) 1px, transparent 1px)
            `,
            backgroundSize: "64px 64px",
          }}
        />
      </div>

      <div className="relative min-h-screen">
        {/* Top bar */}
        <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#07090d]/75 px-5 py-4 backdrop-blur-2xl sm:px-8">
          <div className="mx-auto flex max-w-[1400px] items-center justify-between">
            <div>
              <p className="text-xs text-white/35">
                AETHER INTELLIGENCE
              </p>

              <h1 className="mt-1 text-lg font-semibold tracking-tight sm:text-xl">
                AI Analyst
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white/50 sm:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
                AI Online
              </div>

              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.05] text-xs font-medium text-white/70">
                AK
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="mx-auto max-w-[1400px] px-5 py-10 sm:px-8 lg:py-14">
          {/* Hero */}
          <section className="mx-auto max-w-4xl text-center">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-orange-400/15 bg-orange-400/[0.06] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-300">
              <span className="h-1.5 w-1.5 rounded-full bg-orange-400 shadow-[0_0_10px_rgba(249,115,22,0.7)]" />
              AI Business Intelligence
            </div>

            <h2 className="mt-6 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl lg:text-6xl">
              Ask your business
              <span className="block text-white/35">
                anything.
              </span>
            </h2>

            <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-white/40 sm:text-base">
              Ask questions about your revenue, customers, growth and
              performance. Aether Intelligence turns your business data
              into clear decisions.
            </p>
          </section>

          {/* Analyst card */}
          <section className="mx-auto mt-10 max-w-4xl">
            <div className="relative overflow-hidden rounded-[28px] border border-white/[0.08] bg-white/[0.035] p-5 shadow-[0_30px_100px_rgba(0,0,0,0.25)] backdrop-blur-xl sm:p-7">
              <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-orange-400/[0.08] blur-3xl" />

              <div className="relative">
                {/* AI identity */}
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 to-emerald-400 text-lg font-semibold shadow-[0_0_30px_rgba(249,115,22,0.18)]">
                    ✦
                  </div>

                  <div>
                    <p className="text-sm font-semibold">
                      Aether AI Analyst
                    </p>

                    <p className="text-[10px] text-white/35">
                      Powered by your business intelligence
                    </p>
                  </div>

                  <span className="ml-auto flex items-center gap-2 text-[10px] text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Ready
                  </span>
                </div>

                {/* Input */}
                <div className="mt-7 rounded-2xl border border-white/[0.08] bg-black/20 p-2">
                  <textarea
                    value={question}
                    onChange={(e) => {
                      setQuestion(e.target.value);
                      setAsked(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleAsk();
                      }
                    }}
                    placeholder="Ask a question about your business..."
                    rows={3}
                    className="w-full resize-none bg-transparent px-4 py-3 text-sm text-white outline-none placeholder:text-white/25"
                  />

                  <div className="flex items-center justify-between border-t border-white/[0.06] px-2 pt-2">
                    <span className="px-2 text-[10px] text-white/25">
                      Press Enter to analyze
                    </span>

                    <button
                      onClick={handleAsk}
                      className="rounded-xl bg-white px-5 py-2.5 text-xs font-semibold text-black transition hover:bg-white/90"
                    >
                      Ask AI →
                    </button>
                  </div>
                </div>

                {/* Suggestions */}
                <div className="mt-5">
                  <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/25">
                    Try asking
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => askSuggestion(suggestion)}
                        className="rounded-full border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-[11px] text-white/45 transition hover:border-orange-400/20 hover:bg-orange-400/[0.06] hover:text-orange-200"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* AI response */}
          {asked && (
            <section className="mx-auto mt-6 max-w-4xl">
              <div className="rounded-[28px] border border-orange-400/15 bg-gradient-to-br from-orange-500/[0.08] via-white/[0.025] to-emerald-500/[0.05] p-6 sm:p-8">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-400/10 text-orange-300">
                    ✦
                  </div>

                  <div>
                    <p className="text-sm font-semibold">
                      AI Analysis
                    </p>

                    <p className="text-[10px] text-white/30">
                      Generated from your business data
                    </p>
                  </div>
                </div>

                <div className="mt-7">
                  <p className="text-xs uppercase tracking-[0.16em] text-orange-300/70">
                    Executive summary
                  </p>

                  <h3 className="mt-3 text-xl font-medium leading-8 tracking-tight sm:text-2xl">
                    Your business is showing strong momentum, with revenue
                    growth being driven by returning customers.
                  </h3>

                  <p className="mt-4 text-sm leading-7 text-white/40">
                    Revenue increased by 18.4% compared with the previous
                    period. Customer retention and growth are both trending
                    positively, suggesting that existing customers are
                    contributing significantly to current performance.
                  </p>
                </div>

                {/* Findings */}
                <div className="mt-7 grid gap-3 sm:grid-cols-3">
                  {insights.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-2xl border border-white/[0.07] bg-black/20 p-4"
                    >
                      <p className="text-[10px] text-white/30">
                        {item.label}
                      </p>

                      <p className="mt-2 text-xl font-semibold">
                        {item.value}
                      </p>

                      <p className="mt-1 text-[10px] text-emerald-300">
                        {item.change}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Recommendation */}
                <div className="mt-5 rounded-2xl border border-white/[0.07] bg-black/20 p-5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/30">
                    Recommended action
                  </p>

                  <p className="mt-3 text-sm leading-6 text-white/65">
                    Continue investing in your highest-retention customer
                    segments while monitoring acquisition costs. The current
                    growth pattern suggests that customer loyalty is becoming
                    an important growth engine.
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* Bottom cards */}
          <section className="mx-auto mt-6 grid max-w-4xl gap-5 md:grid-cols-2">
            <div className="rounded-3xl border border-white/[0.07] bg-white/[0.035] p-6">
              <p className="text-xs text-white/30">
                What AI can analyze
              </p>

              <div className="mt-5 space-y-3">
                {[
                  "Revenue & sales performance",
                  "Customer behavior",
                  "Growth opportunities",
                  "Business risks",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.025] px-4 py-3"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-orange-400/10 text-xs text-orange-300">
                      ✓
                    </span>

                    <span className="text-xs text-white/55">
                      {item}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-white/[0.07] bg-white/[0.035] p-6">
              <p className="text-xs text-white/30">
                Intelligence status
              </p>

              <div className="mt-5 rounded-2xl border border-emerald-400/10 bg-emerald-400/[0.04] p-5">
                <div className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />

                  <span className="text-sm font-medium text-emerald-200">
                    Systems operational
                  </span>
                </div>

                <p className="mt-3 text-xs leading-6 text-white/35">
                  Your business intelligence workspace is ready to analyze
                  connected data and generate actionable insights.
                </p>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/[0.05] bg-white/[0.025] p-3">
                  <p className="text-[10px] text-white/25">
                    Data sources
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    4
                  </p>
                </div>

                <div className="rounded-xl border border-white/[0.05] bg-white/[0.025] p-3">
                  <p className="text-[10px] text-white/25">
                    AI insights
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    42
                  </p>
                </div>
              </div>
            </div>
          </section>

          <p className="mt-12 text-center text-[10px] uppercase tracking-[0.2em] text-white/15">
            Aether Intelligence · Turn data into decisions
          </p>
        </div>
      </div>
    </main>
  );
}