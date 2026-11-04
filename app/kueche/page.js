'use client';

import { useState, useEffect } from 'react';
import { supabase, formatBestellNummer } from '../../lib/supabase';

export default function KuechenDisplay() {
  const [freigeschaltet, setFreigeschaltet] = useState(false);
  const [pinEingabe, setPinEingabe] = useState('');
  const STAFF_PIN = process.env.NEXT_PUBLIC_STAFF_PIN || '1234';

  const [inArbeitListe, setInArbeitListe] = useState([]);
  const [fertigListe, setFertigListe] = useState([]);
  const [aktiveBestellungId, setAktiveBestellungId] = useState(null);

  useEffect(() => {
    if (!freigeschaltet) return;
    ladeKuechenDaten();

    const channel = supabase
      .channel('kueche-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bestellungen' },
        () => {
          ladeKuechenDaten();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [freigeschaltet]);

  async function ladeKuechenDaten() {
    const { data } = await supabase
      .from('bestellungen')
      .select('*, bestellpositionen(*)')
      .in('status', ['In Arbeit', 'Fertig'])
      .order('id', { ascending: true });

    if (data) {
      const arbeit = data.filter((b) => b.status === 'In Arbeit');
      const fertig = data.filter((b) => b.status === 'Fertig');
      setInArbeitListe(arbeit);
      setFertigListe(fertig);

      if (arbeit.length > 0 && !arbeit.some((b) => b.id === aktiveBestellungId)) {
        setAktiveBestellungId(arbeit[0].id);
      } else if (arbeit.length === 0) {
        setAktiveBestellungId(null);
      }
    }
  }

  async function aufFertigSetzen(id) {
    await supabase.from('bestellungen').update({ status: 'Fertig' }).eq('id', id);
    ladeKuechenDaten();
  }

  async function alsAusgegebenEntfernen(id) {
    await supabase.from('bestellungen').update({ status: 'Ausgegeben' }).eq('id', id);
    ladeKuechenDaten();
  }

  // PIN-Sperrbildschirm
  if (!freigeschaltet) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 p-8 rounded-3xl max-w-sm w-full text-center border border-slate-700">
          <h1 className="text-2xl font-black text-white mb-4">Küchen-iPad Login</h1>
          <input
            type="password"
            placeholder="Personal-PIN (Standard: 1234)"
            value={pinEingabe}
            onChange={(e) => setPinEingabe(e.target.value)}
            className="w-full p-4 rounded-xl bg-slate-900 text-white text-center text-2xl font-bold mb-4 border border-slate-600"
          />
          <button
            onClick={() => {
              if (pinEingabe === STAFF_PIN) setFreigeschaltet(true);
              else alert('Falscher PIN!');
            }}
            className="w-full bg-emerald-600 text-white font-black py-4 rounded-xl text-lg"
          >
            Entsperren
          </button>
        </div>
      </div>
    );
  }

  const ausgewählteBestellung = inArbeitListe.find((b) => b.id === aktiveBestellungId);

  return (
    <div className="min-h-screen bg-slate-900 text-white grid grid-cols-1 lg:grid-cols-12">
      <div className="lg:col-span-4 border-r border-slate-800 p-4 flex flex-col justify-between">
        <div>
          <h1 className="text-xl font-black text-amber-400 uppercase tracking-wider mb-4">
            Offene Bons ({inArbeitListe.length})
          </h1>
          <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
            {inArbeitListe.map((best) => (
              <button
                key={best.id}
                onClick={() => setAktiveBestellungId(best.id)}
                className={`w-full p-4 rounded-2xl text-left transition border-2 flex justify-between items-center ${
                  best.id === aktiveBestellungId
                    ? 'bg-amber-500 text-slate-950 border-amber-300 font-black shadow-lg'
                    : 'bg-slate-800 text-white border-slate-700'
                }`}
              >
                <span className="text-3xl font-black">{formatBestellNummer(best.id)}</span>
                <span className="text-sm font-bold px-3 py-1 rounded-full bg-black/20">
                  {best.bestellpositionen?.reduce((s, p) => s + p.menge, 0)} Artikel
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-slate-800 pt-4 mt-6">
          <h2 className="text-sm font-bold text-emerald-400 uppercase mb-2">
            Abholbereit am Monitor ({fertigListe.length}) – Tippen wenn abgeholt:
          </h2>
          <div className="flex flex-wrap gap-2">
            {fertigListe.map((best) => (
              <button
                key={best.id}
                onClick={() => alsAusgegebenEntfernen(best.id)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-4 py-2 rounded-xl text-lg flex items-center gap-2"
              >
                <span>{formatBestellNummer(best.id)}</span>
                <span className="text-xs bg-black/30 px-2 py-0.5 rounded">✕ Weg</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="lg:col-span-8 p-8 flex flex-col justify-between">
        {!ausgewählteBestellung ? (
          <div className="m-auto text-center text-slate-500">
            <p className="text-3xl font-black">Alles erledigt!</p>
            <p className="text-lg mt-2">
              Sobald vorne an der Kasse bezahlt wird, erscheint der Bon sofort hier.
            </p>
          </div>
        ) : (
          <>
            <div>
              <div className="flex justify-between items-center border-b border-slate-800 pb-6 mb-6">
                <div>
                  <span className="text-sm uppercase text-slate-400 font-bold">
                    Aktuelle Zubereitung
                  </span>
                  <div className="text-7xl font-black text-amber-400">
                    {formatBestellNummer(ausgewählteBestellung.id)}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {ausgewählteBestellung.bestellpositionen?.map((pos) => (
                  <div
                    key={pos.id}
                    className="bg-slate-800 border-2 border-slate-700 p-6 rounded-3xl"
                  >
                    <div className="text-3xl font-black text-white">
                      {pos.menge}x {pos.produkt_name}
                    </div>
                    {pos.extras ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {pos.extras.split(', ').map((extra, i) => (
                          <span
                            key={i}
                            className="bg-red-600 text-white text-xl font-black px-4 py-2 rounded-xl uppercase tracking-wide shadow"
                          >
                            ! {extra}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2 text-slate-400 font-semibold text-lg">
                        Standard (Keine Extrawünsche)
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => aufFertigSetzen(ausgewählteBestellung.id)}
              className="w-full bg-emerald-500 hover:bg-emerald-400 active:scale-98 text-slate-950 font-black py-7 rounded-3xl text-3xl shadow-2xl mt-8"
            >
              ✓ FERTIG – NUMMER {formatBestellNummer(ausgewählteBestellung.id)} AUFRUFEN
            </button>
          </>
        )}
      </div>
    </div>
  );
}
