'use client';

import { useEffect, useState } from 'react';

export default function SwarmDashboard() {
  const [graph, setGraph] = useState<any>(null);
  const [wallets, setWallets] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = () => {
      fetch('/api/swarm/graph').then(res => res.json()).then(setGraph);
      fetch('/api/swarm/wallets').then(res => res.json()).then(setWallets);
      fetch('/api/swarm/registry').then(res => res.json()).then(setServices);
    };
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-12">
      <header>
        <h1 className="text-4xl font-bold text-white tracking-tighter">Swarm Intelligence Control</h1>
        <p className="text-gray-400 mt-2">Inter-Org economic settlement and cross-organizational delegation.</p>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Left: Financial Ledger */}
        <div className="space-y-8">
          <section className="bg-white/5 rounded-3xl border border-white/10 p-6 shadow-2xl">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-6">Org Wallet Heatmap</h2>
            <div className="space-y-4">
              {wallets.map(w => (
                <div key={w.id} className="p-4 rounded-2xl bg-black/40 border border-white/5 flex justify-between items-center">
                  <div>
                    <h3 className="text-sm font-bold text-white truncate max-w-[150px]">{w.mission_summary.slice(0, 40)}...</h3>
                    <p className="text-[10px] text-gray-500 font-mono mt-1">{w.run_id}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-cyan-400">§{w.balance_credits.toFixed(1)}</p>
                    <p className={`text-[10px] font-bold uppercase ${w.total_earned > w.total_spent ? 'text-green-500' : 'text-orange-500'}`}>
                      {w.total_earned > w.total_spent ? 'Profit' : 'Deficit'}
                    </p>
                  </div>
                </div>
              ))}
              {wallets.length === 0 && <p className="text-xs text-gray-600 italic">No org wallets active.</p>}
            </div>
          </section>

          <section className="bg-white/5 rounded-3xl border border-white/10 p-6">
             <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-6">Capability Registry</h2>
             <div className="space-y-3">
               {services.map(s => (
                 <div key={s.id} className="text-xs flex justify-between items-center border-b border-white/5 pb-3 last:border-0">
                    <div>
                      <span className="text-gray-300 font-bold">{s.display_name}</span>
                      <p className="text-[10px] text-gray-500">{s.service_key}</p>
                    </div>
                    <span className="text-cyan-500 font-mono font-bold">§{s.unit_price}/task</span>
                 </div>
               ))}
             </div>
          </section>
        </div>

        {/* Center/Right: Visual Swarm Map */}
        <div className="xl:col-span-2 space-y-8">
          <section className="bg-black/80 rounded-3xl border border-cyan-500/20 p-8 min-h-[600px] relative overflow-hidden shadow-[0_0_50px_rgba(6,182,212,0.1)]">
             <div className="absolute top-6 left-6">
                <h2 className="text-xs font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
                  Live Message Flow
                </h2>
             </div>
             
             {/* Simplified Nervous System Viz (List based for portability, but styled as nodes) */}
             <div className="mt-12 space-y-4">
                {graph?.contracts?.map((c: any) => (
                  <div key={c.id} className="relative group">
                    <div className="flex items-center gap-6">
                       <div className="w-32 h-16 rounded-xl bg-white/5 border border-white/10 flex flex-col items-center justify-center p-2">
                          <span className="text-[10px] text-gray-500 font-mono">MASTER</span>
                          <span className="text-[9px] text-gray-300 truncate w-full text-center">{c.master_run_id}</span>
                       </div>
                       
                       <div className="flex-1 h-px bg-gradient-to-r from-cyan-500/50 via-cyan-500 to-cyan-500/50 relative">
                          <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-cyan-400 font-bold whitespace-nowrap bg-black px-3 py-1 rounded-full border border-cyan-500/20">
                             HIRE: {c.service_key} (§{c.budget_credits})
                          </div>
                          <div className="absolute top-1/2 left-0 right-0 h-4 -translate-y-1/2 bg-cyan-500/5 blur-xl"></div>
                       </div>

                       <div className="w-32 h-16 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex flex-col items-center justify-center p-2">
                          <span className="text-[10px] text-cyan-400 font-bold">SPECIALIST</span>
                          <span className="text-[9px] text-gray-300 truncate w-full text-center">{c.contractor_run_id}</span>
                       </div>
                    </div>
                  </div>
                ))}
                {(!graph?.contracts || graph.contracts.length === 0) && (
                  <div className="h-[400px] flex flex-col items-center justify-center text-center space-y-4">
                     <p className="text-gray-600 max-w-sm italic">The swarm is idling. Start a hierarchical mission to see inter-org collaboration and economic flow.</p>
                     <div className="grid grid-cols-5 gap-1 opacity-20">
                        {Array.from({length: 25}).map((_, i) => <div key={i} className="w-2 h-2 rounded-full bg-cyan-400"></div>)}
                     </div>
                  </div>
                )}
             </div>

             <div className="absolute bottom-6 right-6 flex gap-4 text-[10px] text-gray-500 font-mono">
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded bg-white/10"></span> Idle</div>
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded bg-cyan-500"></span> Active Transfer</div>
             </div>
          </section>

          <section className="bg-white/5 rounded-3xl border border-white/10 overflow-hidden">
             <div className="p-6 border-b border-white/10">
               <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Global Swarm Event Log</h2>
             </div>
             <div className="max-h-[300px] overflow-y-auto font-mono text-[11px] p-6 space-y-2">
                {graph?.messages?.map((m: any) => (
                  <div key={m.id} className="flex gap-4 border-l border-white/5 pl-4">
                    <span className="text-gray-500 shrink-0">[{new Date(m.created_at).toLocaleTimeString()}]</span>
                    <span className="text-cyan-500 whitespace-nowrap">{m.sender_run_id.slice(0, 8)} ➔ {m.receiver_run_id.slice(0, 8)}:</span>
                    <span className="text-gray-300 truncate">{JSON.stringify(m.payload_json)}</span>
                  </div>
                ))}
                {(!graph?.messages || graph.messages.length === 0) && <p className="text-gray-600 italic">Listening for inter-org events...</p>}
             </div>
          </section>
        </div>
      </div>
    </div>
  );
}
