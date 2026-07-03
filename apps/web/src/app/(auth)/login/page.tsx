'use client'

import { SignIn } from '@clerk/nextjs'
import { Bot, ShieldCheck, Terminal, Radio } from 'lucide-react'

export default function LoginPage() {
  return (
    <div className="min-h-screen w-full bg-slate-950 flex flex-col md:flex-row font-sans overflow-hidden">
      
      {/* LEFT PANEL: OPERATIONAL TELEMETRY & APP ETHOS */}
      <div className="w-full md:w-[45%] lg:w-[40%] bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 border-r border-slate-900 p-8 md:p-12 flex flex-col justify-between relative overflow-hidden">
        
        {/* Background Grid Pattern Overlay */}
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none mix-blend-overlay bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:24px_24px]" />
        
        {/* Glow ambient effects */}
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 right-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* Top Header Segment */}
        <div className="relative z-10 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 border border-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-sm font-black tracking-tight text-white block">Zuri OS</span>
            <span className="text-[10px] text-indigo-400 font-mono tracking-widest uppercase">Autonomous Layer</span>
          </div>
        </div>

        {/* Core Marketing / Tech Copy Block */}
        <div className="relative z-10 my-auto py-12 space-y-6">
          <div className="space-y-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-bold text-indigo-300 uppercase tracking-wider">
              <Radio className="w-3 h-3 text-indigo-400 animate-pulse" /> Live Node Synchronization
            </span>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white leading-tight">
              The Intelligent Command Center for Your Business.
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed max-w-sm">
              Consolidate conversations, autonomously trace conversion drops, sync pricing guidelines, and orchestrate campaigns straight from a centralized neural interface.
            </p>
          </div>

          {/* Simulated Premium Telemetry Widget */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 space-y-3 font-mono shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-slate-850 pb-2">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <Terminal className="w-3 h-3 text-indigo-400" /> core_telemetry_dump
              </div>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            
            <div className="space-y-1.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-500">SYSTEM_NODE</span>
                <span className="text-slate-300">zuri-edge-zambia</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">INTELLIGENCE_INDEX</span>
                <span className="text-emerald-400 font-bold">94% Optimal</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">PIPELINE_MONITORS</span>
                <span className="text-indigo-400 font-bold">Active Threads</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Infrastructure Security Meta */}
        <div className="relative z-10 flex items-center gap-2 text-[11px] text-slate-500 border-t border-slate-900 pt-4">
          <ShieldCheck className="w-4 h-4 text-indigo-500/70" />
          <span>Enterprise End-to-End Cryptographic Validation</span>
        </div>
      </div>

      {/* RIGHT PANEL: CLERK INBOUND AUTHENTICATION PORTAL */}
      <div className="flex-1 bg-slate-950 flex flex-col justify-center items-center p-6 md:p-12 relative">
        
        <div className="absolute top-8 right-8 text-[11px] font-mono text-slate-700 hidden sm:block">
          SECURE_AUTH_PORTAL // 443
        </div>

        <div className="w-full max-w-md mx-auto flex flex-col justify-center items-center">
          
          <div className="w-full shadow-2xl rounded-2xl overflow-hidden border border-slate-900/40">
            <SignIn 
              appearance={{
                layout: {
                  socialButtonsPlacement: 'bottom',
                  showOptionalFields: false,
                },
                variables: {
                  colorPrimary: '#4f46e5',
                  colorBackground: '#020617',
                  colorText: '#f8fafc',
                  colorTextSecondary: '#94a3b8',
                  colorInputBackground: '#0f172a',
                  colorInputText: '#ffffff',
                  colorBorder: '#1e293b',
                },
                elements: {
                  rootBox: "w-full",
                  card: "bg-transparent shadow-none p-6 sm:p-8 w-full border-none",
                  headerTitle: "text-xl font-extrabold tracking-tight text-white text-left",
                  headerSubtitle: "text-xs text-slate-400 text-left mt-1",
                  socialButtonsBlockButton: "bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-200 transition-all text-xs font-semibold rounded-xl py-2.5",
                  dividerLine: "bg-slate-850",
                  dividerText: "text-[10px] text-slate-500 uppercase tracking-widest font-bold",
                  formLabel: "font-bold text-[11px] uppercase tracking-wider text-slate-400 mb-1",
                  formButtonPrimary: "bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2.5 rounded-xl transition-all shadow-md shadow-indigo-600/10 mt-2",
                  formFieldInput: "bg-slate-900 border border-slate-800 focus:border-slate-700 text-xs rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none transition-colors",
                  footerActionText: "text-xs text-slate-400",
                  footerActionLink: "text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors",
                }
              }}
            />
          </div>

        </div>
      </div>

    </div>
  )
}
