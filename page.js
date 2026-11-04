'use client';

import { useState, useEffect } from 'react';
import { supabase, EXTRA_OPTIONEN, formatBestellNummer } from '../../lib/supabase';

export default function KassenDashboard() {
  const [freigeschaltet, setFreigeschaltet] = useState(false);
  const [pinEingabe, setPinEingabe] = useState('');
  const [aktiverTab, setAktiverTab] = useState('handy'); // 'handy' oder 'manuell'

  const [unbezahlteBestellungen, setUnbezahlteBestellungen] = useState([]);
  const [produkte, setProdukte] = useState([]);
  const [kassenWarenkorb, setKassenWarenkorb] = useState([]);
  const [modalProdukt, setModalProdukt] = useState(null);
  const [gewaehlteExtras, setGewaehlteExtras] = useState([]);
  const [letzteNummerBanner, setLetzteNummerBanner] = useState(null);

  const STAFF_PIN = process.env.NEXT_PUBLIC_STAFF_PIN || '1234';

  useEffect(() => {
    if (!freigeschaltet) return;
    ladeDaten();

    const channel = supabase
      .channel('kasse-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bestellungen' },
        () => {
          ladeUnbezahlteBestellungen();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [freigeschaltet]);

  async function ladeDaten() {
    await Promise.all([ladeUnbezahlteBestellungen(), ladeProdukte()]);
  }

  async function ladeProdukte() {
    const { data } = await supabase
      .from('produkte')
      .select('*')
      .eq('verfuegbar', true)
      .order('id', { ascending: true });
    if (data) setProdukte(data);
  }

  async function ladeUnbezahlteBestellungen() {
    const { data } = await supabase
      .from('bestellungen')
      .select('*, bestellpositionen(*)')
      .eq('status', 'Unbezahlt')
      .order('id', { ascending: true });
    if (data) setUnbezahlteBestellungen(data);
  }

  async function alsBezahltMarkieren(bestellId) {
    await supabase
      .from('bestellungen')
      .update({ status: 'In Arbeit' })
      .eq('id', bestellId);
    ladeUnbezahlteBestellungen();
  }

  async function bestellungStornieren(bestellId) {
    await supabase
      .from('bestellungen')
      .update({ status: 'Storniert' })
      .eq('id', bestellId);
    ladeUnbezahlteBestellungen();
  }

  // 15-Minuten-Regel: Alte unbezahlte Spass-Bestellungen aufräumen
  async function alteUnbezahlteAufraeumen() {
    const vor15Min = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    await supabase
      .from('bestellungen')
      .update({ status: 'Storniert' })
      .eq('status', 'Unbezahlt')
      .lt('zeitstempel', vor15Min);
    ladeUnbezahlteBestellungen();
  }

  // Manuelle Kassen-Funktionen
  function kasseProduktKlick(prod) {
    if (prod.hat_extras) {
      setModalProdukt(prod);
      setGewaehlteExtras([]);
    } else {
      inKassenWarenkorb(prod, []);
    }
  }

  function inKassenWarenkorb(prod, extrasArray) {
    const extrasText = extrasArray.join(', ');
    setKassenWarenkorb([
      ...kassenWarenkorb,
      {
        id: prod.id,
        name: prod.name,
        preis: parseFloat(prod.preis),
        menge: 1,
        extras: extrasText,
      },
    ]);
    setModalProdukt(null);
  }

  const kassenSumme = kassenWarenkorb.reduce((s, item) => s + item.preis * item.menge, 0);

  // Manuelle Bestellung überspringt 'Unbezahlt' und geht direkt auf 'In Arbeit'
  async function manuelleBestellungSenden() {
    if (kassenWarenkorb.length === 0) return;

    const { data: neueBestellung, error } = await supabase
      .from('bestellungen')
      .insert({
        gesamtpreis: kassenSumme.toFixed(2),
        status: 'In Arbeit',
        zahlungsart: 'Direkt an Kasse',
      })
      .select('*')
      .single();

    if (error || !neueBestellung) {
      alert('Fehler beim Speichern!');
      return;
    }

    const positionen = kassenWarenkorb.map((item) => ({
      bestell_id: neueBestellung.id,
      produkt_id: item.id,
      produkt_name: item.name,
      menge: item.menge,
      einzelpreis: item.preis,
      extras: item.extras,
    }));

    await supabase.from('bestellpositionen').insert(positionen);
    setKassenWarenkorb([]);
    setLetzteNummerBanner(formatBestellNummer(neueBestellung.id));
  }

  if (!freigeschaltet) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 p-8 rounded-3xl max-w-sm w-full text-center border border-slate-700">
          <h1 className="text-2xl font-black text-white mb-4">Kassen-iPad Login</h1>
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

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Top-Navigation mit den 2 Tabs */}
      <div className="bg-slate-900 text-white p-4 flex flex-wrap justify-between items-center gap-4">
        <div className="flex gap-3">
          <button
            onClick={() => setAktiverTab('handy')}
            className={`px-6 py-3 rounded-xl font-black text-lg transition ${
              aktiverTab === 'handy'
                ? 'bg-amber-500 text-slate-950 shadow-lg'
                : 'bg-slate-800 text-slate-300'
            }`}
          >
            1. Handy-Bestellungen kassieren ({unbezahlteBestellungen.length})
          </button>
          <button
            onClick={() => setAktiverTab('manuell')}
            className={`px-6 py-3 rounded-xl font-black text-lg transition ${
              aktiverTab === 'manuell'
                ? 'bg-emerald-500 text-slate-950 shadow-lg'
                : 'bg-slate-800 text-slate-300'
            }`}
          >
            2. Manuelle Kasse (Laufkundschaft)
          </button>
        </div>
        {aktiverTab === 'handy' && (
          <button
            onClick={alteUnbezahlteAufraeumen}
            className="bg-slate-700 hover:bg-slate-600 text-xs px-4 py-2.5 rounded-lg font-semibold"
          >
            Alte Unbezahlte (&gt;15 Min) löschen
          </button>
        )}
      </div>

      {/* TAB 1: HANDY-BESTELLUNGEN ABKASSIEREN */}
      {aktiverTab === 'handy' && (
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {unbezahlteBestellungen.length === 0 && (
            <div className="col-span-full text-center py-20 text-slate-400 font-bold text-xl">
              Aktuell warten keine unbezahlten Handy-Bestellungen.
            </div>
          )}
          {unbezahlteBestellungen.map((best) => (
            <div
              key={best.id}
              className="bg-white rounded-3xl p-6 shadow-md border-2 border-amber-400 flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-center border-b pb-3 mb-4">
                  <span className="text-4xl font-black text-slate-900">
                    {formatBestellNummer(best.id)}
                  </span>
                  <span className="text-2xl font-extrabold text-red-700">
                    CHF {Number(best.gesamtpreis).toFixed(2)}
                  </span>
                </div>
                <ul className="space-y-2 mb-6">
                  {best.bestellpositionen?.map((pos) => (
                    <li key={pos.id} className="text-slate-800 font-semibold">
                      {pos.menge}x {pos.produkt_name}
                      {pos.extras && (
                        <span className="block text-xs text-red-600 font-bold">
                          → {pos.extras}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => bestellungStornieren(best.id)}
                  className="w-1/3 bg-red-100 text-red-700 font-bold py-4 rounded-2xl"
                >
                  Storno
                </button>
                <button
                  onClick={() => alsBezahltMarkieren(best.id)}
                  className="w-2/3 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 rounded-2xl text-lg shadow-md"
                >
                  ✓ Bezahlt (An Küche)
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 2: MANUELLE KASSE (POS) */}
      {aktiverTab === 'manuell' && (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
          {/* Linke 2/3: Grosse Produkt-Buttons */}
          <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-4 content-start">
            {produkte.map((prod) => (
              <button
                key={prod.id}
                onClick={() => kasseProduktKlick(prod)}
                className="bg-white hover:bg-emerald-50 active:scale-95 border-2 border-slate-200 p-5 rounded-2xl shadow-sm text-left flex flex-col justify-between h-32"
              >
                <span className="font-extrabold text-slate-900 text-lg leading-tight">
                  {prod.name}
                </span>
                <span className="font-black text-emerald-700 text-base">
                  CHF {Number(prod.preis).toFixed(2)}
                </span>
              </button>
            ))}
          </div>

          {/* Rechtes 1/3: Aktueller Kassen-Warenkorb */}
          <div className="bg-white rounded-3xl p-6 shadow-lg border border-slate-200 flex flex-col justify-between">
            <div>
              <h2 className="text-xl font-black border-b pb-3 mb-4">Aktuelle Eingabe</h2>
              {letzteNummerBanner && (
                <div className="bg-emerald-100 border-2 border-emerald-500 text-emerald-900 p-4 rounded-2xl mb-4 text-center">
                  <p className="text-xs uppercase font-bold">Kunde erhält Bestellnummer:</p>
                  <p className="text-4xl font-black">{letzteNummerBanner}</p>
                </div>
              )}
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {kassenWarenkorb.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-start border-b pb-2">
                    <div>
                      <div className="font-bold">{item.name}</div>
                      {item.extras && (
                        <div className="text-xs text-red-600 font-bold">→ {item.extras}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold">CHF {item.preis.toFixed(2)}</span>
                      <button
                        onClick={() => {
                          const kopie = [...kassenWarenkorb];
                          kopie.splice(idx, 1);
                          setKassenWarenkorb(kopie);
                        }}
                        className="text-red-600 font-black px-2"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t mt-4">
              <div className="flex justify-between text-2xl font-black mb-4">
                <span>Total:</span>
                <span>CHF {kassenSumme.toFixed(2)}</span>
              </div>
              <button
                onClick={manuelleBestellungSenden}
                disabled={kassenWarenkorb.length === 0}
                className="w-full bg-emerald-600 disabled:bg-slate-300 text-white font-black py-5 rounded-2xl text-xl shadow-lg"
              >
                Kassiert & an Küche senden
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extras-Popup für die manuelle Kasse */}
      {modalProdukt && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl">
            <h3 className="text-2xl font-black mb-4">{modalProdukt.name} – Extras</h3>
            <div className="grid grid-cols-2 gap-3 mb-6">
              {EXTRA_OPTIONEN.map((extra) => {
                const aktiv = gewaehlteExtras.includes(extra);
                return (
                  <button
                    key={extra}
                    onClick={() =>
                      setGewaehlteExtras(
                        aktiv
                          ? gewaehlteExtras.filter((e) => e !== extra)
                          : [...gewaehlteExtras, extra]
                      )
                    }
                    className={`p-4 rounded-xl font-bold text-base border text-left ${
                      aktiv
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-slate-100 text-slate-800'
                    }`}
                  >
                    {aktiv ? '✓ ' : '+ '} {extra}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setModalProdukt(null)}
                className="w-1/3 py-4 rounded-xl font-bold bg-slate-200"
              >
                Abbrechen
              </button>
              <button
                onClick={() => inKassenWarenkorb(modalProdukt, gewaehlteExtras)}
                className="w-2/3 py-4 rounded-xl font-black bg-emerald-600 text-white text-lg"
              >
                Hinzufügen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
