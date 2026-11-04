'use client';

import { useState, useEffect } from 'react';
import { supabase, formatBestellNummer } from '../../lib/supabase';

export default function AbholMonitor() {
  const [inArbeit, setInArbeit] = useState([]);
  const [fertig, setFertig] = useState([]);

  useEffect(() => {
    ladeMonitorDaten();

    const channel = supabase
      .channel('monitor-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bestellungen' },
        () => {
          ladeMonitorDaten();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function ladeMonitorDaten() {
    const { data } = await supabase
      .from('bestellungen')
      .select('id, status')
      .in('status', ['In Arbeit', 'Fertig'])
      .order('id', { ascending: true });

    if (data) {
      setInArbeit(data.filter((b) => b.status === 'In Arbeit'));
      setFertig(data.filter((b) => b.status === 'Fertig'));
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white grid grid-cols-2 divide-x-4 divide-slate-800 select-none">
      {/* LINKE SPALTE: WIRD ZUBEREITET */}
      <div className="p-8 flex flex-col">
        <div className="bg-amber-500/20 border-2 border-amber-500 rounded-3xl p-6 text-center mb-8">
          <h1 className="text-4xl font-black text-amber-400 uppercase tracking-wider">
            Wird zubereitet
          </h1>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
          {inArbeit.map((best) => (
            <div
              key={best.id}
              className="bg-slate-900 border-2 border-slate-700 rounded-3xl py-8 text-center text-5xl font-black text-slate-200"
            >
              {formatBestellNummer(best.id)}
            </div>
          ))}
        </div>
      </div>

      {/* RECHTE SPALTE: BITTE ABHOLEN */}
      <div className="p-8 flex flex-col bg-emerald-950/20">
        <div className="bg-emerald-500 border-2 border-emerald-300 rounded-3xl p-6 text-center mb-8 shadow-lg">
          <h1 className="text-4xl font-black text-slate-950 uppercase tracking-wider">
            Bitte abholen!
          </h1>
        </div>
        <div className="grid grid-cols-2 gap-6">
          {fertig.map((best) => (
            <div
              key={best.id}
              className="bg-emerald-500 text-slate-950 rounded-3xl py-10 text-center text-7xl font-black shadow-2xl animate-bounce"
            >
              {formatBestellNummer(best.id)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
