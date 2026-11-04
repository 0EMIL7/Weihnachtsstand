'use client';

import { useState, useEffect } from 'react';
import { supabase, EXTRA_OPTIONEN, formatBestellNummer } from '../lib/supabase';

export default function KundenSeite() {
  const [produkte, setProdukte] = useState([]);
  const [kategorie, setKategorie] = useState('Alle');
  const [warenkorb, setWarenkorb] = useState([]);
  const [modalProdukt, setModalProdukt] = useState(null);
  const [gewaehlteExtras, setGewaehlteExtras] = useState([]);
  const [aktiveBestellung, setAktiveBestellung] = useState(null);
  const [laedt, setLaedt] = useState(false);

  useEffect(() => {
    ladeProdukte();
    pruefeAktiveBestellung();
  }, []);

  // Echtzeit-Überwachung der eigenen Bestellung
  useEffect(() => {
    if (!aktiveBestellung?.id) return;

    const channel = supabase
      .channel('kunden-bestellung-' + aktiveBestellung.id)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bestellungen',
          filter: `id=eq.${aktiveBestellung.id}`,
        },
        (payload) => {
          const neuerStatus = payload.new.status;
          if (neuerStatus === 'Ausgegeben' || neuerStatus === 'Storniert') {
            localStorage.removeItem('aktive_bestell_id');
            setAktiveBestellung(null);
          } else {
            setAktiveBestellung(payload.new);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [aktiveBestellung?.id]);

  async function ladeProdukte() {
    const { data } = await supabase
      .from('produkte')
      .select('*')
      .eq('verfuegbar', true)
      .order('id', { ascending: true });
    if (data) setProdukte(data);
  }

  async function pruefeAktiveBestellung() {
    let sessionId = localStorage.getItem('stand_session_id');
    if (!sessionId) {
      sessionId = 'sess_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
      localStorage.setItem('stand_session_id', sessionId);
    }

    const gespeicherteId = localStorage.getItem('aktive_bestell_id');
    if (gespeicherteId) {
      const { data } = await supabase
        .from('bestellungen')
        .select('*')
        .eq('id', gespeicherteId)
        .single();

      if (data && data.status !== 'Ausgegeben' && data.status !== 'Storniert') {
        setAktiveBestellung(data);
      } else {
        localStorage.removeItem('aktive_bestell_id');
      }
    }
  }

  function produktAnklicken(prod) {
    if (prod.hat_extras) {
      setModalProdukt(prod);
      setGewaehlteExtras([]);
    } else {
      inDenWarenkorb(prod, []);
    }
  }

  function toggleExtra(extra) {
    if (gewaehlteExtras.includes(extra)) {
      setGewaehlteExtras(gewaehlteExtras.filter((e) => e !== extra));
    } else {
      setGewaehlteExtras([...gewaehlteExtras, extra]);
    }
  }

  function inDenWarenkorb(prod, extrasArray) {
    const extrasText = extrasArray.join(', ');
    const existierenderIndex = warenkorb.findIndex(
      (item) => item.id === prod.id && item.extras === extrasText
    );

    if (existierenderIndex > -1) {
      const kopie = [...warenkorb];
      kopie[existierenderIndex].menge += 1;
      setWarenkorb(kopie);
    } else {
      setWarenkorb([
        ...warenkorb,
        {
          id: prod.id,
          name: prod.name,
          preis: parseFloat(prod.preis),
          menge: 1,
          extras: extrasText,
        },
      ]);
    }
    setModalProdukt(null);
  }

  function mengeAendern(index, delta) {
    const kopie = [...warenkorb];
    kopie[index].menge += delta;
    if (kopie[index].menge <= 0) {
      kopie.splice(index, 1);
    }
    setWarenkorb(kopie);
  }

  const gesamtpreis = warenkorb.reduce((sum, item) => sum + item.preis * item.menge, 0);

  async function bestellungAbsenden() {
    if (warenkorb.length === 0 || laedt) return;
    setLaedt(true);

    try {
      const sessionId = localStorage.getItem('stand_session_id');

      // 1. Kunde anhand Session-ID holen oder anlegen
      let { data: kunde } = await supabase
        .from('kunden')
        .select('id')
        .eq('session_id', sessionId)
        .single();

      if (!kunde) {
        const { data: neuerKunde } = await supabase
          .from('kunden')
          .insert({ session_id: sessionId, name: 'Handy-Kunde' })
          .select('id')
          .single();
        kunde = neuerKunde;
      }

      // 2. Hauptbestellung anlegen (Status: Unbezahlt)
      const { data: neueBestellung, error: bestellError } = await supabase
        .from('bestellungen')
        .insert({
          kunden_id: kunde?.id || null,
          gesamtpreis: gesamtpreis.toFixed(2),
          status: 'Unbezahlt',
          zahlungsart: 'Kasse / TWINT vor Ort',
        })
        .select('*')
        .single();

      if (bestellError) throw bestellError;

      // 3. Bestellpositionen einfügen
      const positionen = warenkorb.map((item) => ({
        bestell_id: neueBestellung.id,
        produkt_id: item.id,
        produkt_name: item.name,
        menge: item.menge,
        einzelpreis: item.preis,
        extras: item.extras,
      }));

      await supabase.from('bestellpositionen').insert(positionen);

      // 4. Spamschutz aktivieren & Bestätigungs-Screen zeigen
      localStorage.setItem('aktive_bestell_id', neueBestellung.id);
      setWarenkorb([]);
      setAktiveBestellung(neueBestellung);
    } catch (err) {
      alert('Fehler beim Senden der Bestellung. Bitte versuche es erneut.');
      console.error(err);
    } finally {
      setLaedt(false);
    }
  }

  // WENN EINE AKTIVE BESTELLUNG EXISTIERT -> LIVE-STATUS ANZEIGEN (SPAMSCHUTZ)
  if (aktiveBestellung) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full bg-slate-800 rounded-3xl p-8 shadow-2xl border border-slate-700">
          <p className="text-sm uppercase tracking-widest text-amber-400 font-semibold mb-2">
            Deine Bestellnummer
          </p>
          <div className="text-7xl font-black text-white my-4 tracking-tight">
            {formatBestellNummer(aktiveBestellung.id)}
          </div>
          <p className="text-xl font-bold text-slate-300 mb-6">
            Betrag: CHF {Number(aktiveBestellung.gesamtpreis).toFixed(2)}
          </p>

          {aktiveBestellung.status === 'Unbezahlt' && (
            <div className="bg-amber-500/20 border-2 border-amber-500 rounded-2xl p-5 mb-6">
              <div className="text-2xl font-extrabold text-amber-400 mb-2">
                1. Bitte an der Kasse bezahlen
              </div>
              <p className="text-slate-200 text-sm">
                Gehe jetzt vor zur Kasse, nenne deine Nummer{' '}
                <strong>{formatBestellNummer(aktiveBestellung.id)}</strong> und bezahle per TWINT
                oder Bar. Erst danach startet die Küche!
              </p>
            </div>
          )}

          {aktiveBestellung.status === 'In Arbeit' && (
            <div className="bg-blue-500/20 border-2 border-blue-400 rounded-2xl p-5 mb-6 animate-pulse">
              <div className="text-2xl font-extrabold text-blue-300 mb-2">
                2. Wird frisch zubereitet!
              </div>
              <p className="text-slate-200 text-sm">
                Deine Zahlung war erfolgreich. Unser Team bereitet deine Bestellung gerade zu.
              </p>
            </div>
          )}

          {aktiveBestellung.status === 'Fertig' && (
            <div className="bg-emerald-500/30 border-2 border-emerald-400 rounded-2xl p-6 mb-6 animate-bounce">
              <div className="text-3xl font-black text-emerald-300 mb-2">
                ABHOLBEREIT!
              </div>
              <p className="text-white text-base">
                Deine Bestellung <strong>{formatBestellNummer(aktiveBestellung.id)}</strong> ist
                fertig! Bitte jetzt an der Ausgabe abholen.
              </p>
            </div>
          )}

          <p className="text-xs text-slate-400 mt-4">
            Diese Seite aktualisiert sich automatisch in Echtzeit. Sobald du dein Essen erhalten
            hast, wird eine neue Bestellung freigeschaltet.
          </p>
        </div>
      </div>
    );
  }

  const gefilterteProdukte =
    kategorie === 'Alle'
      ? produkte
      : produkte.filter((p) => p.kategorie === kategorie);

  return (
    <div className="max-w-lg mx-auto pb-36 min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-red-800 text-white p-6 rounded-b-3xl shadow-lg">
        <h1 className="text-2xl font-black tracking-tight">Weihnachtsstand & Döner</h1>
        <p className="text-red-100 text-sm mt-1">
          Am Handy zusammenstellen → Nummer an der Kasse nennen & bezahlen
        </p>
      </header>

      {/* Kategorie-Filter */}
      <div className="flex gap-2 overflow-x-auto p-4 sticky top-0 bg-slate-50/95 backdrop-blur z-10">
        {['Alle', 'Essen', 'Heissgetränke', 'Süsswaren'].map((kat) => (
          <button
            key={kat}
            onClick={() => setKategorie(kat)}
            className={`px-4 py-2 rounded-full font-bold text-sm whitespace-nowrap transition ${
              kategorie === kat
                ? 'bg-red-700 text-white shadow'
                : 'bg-white text-slate-700 border border-slate-200'
            }`}
          >
            {kat}
          </button>
        ))}
      </div>

      {/* Produktliste */}
      <div className="px-4 space-y-3">
        {gefilterteProdukte.map((prod) => (
          <div
            key={prod.id}
            className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex justify-between items-center gap-4"
          >
            <div>
              <h3 className="font-bold text-slate-900 text-lg">{prod.name}</h3>
              <p className="text-slate-500 text-xs mt-0.5">{prod.beschreibung}</p>
              <p className="text-red-700 font-extrabold mt-2">
                CHF {Number(prod.preis).toFixed(2)}
              </p>
            </div>
            <button
              onClick={() => produktAnklicken(prod)}
              className="bg-red-700 hover:bg-red-800 active:scale-95 text-white font-bold px-4 py-3 rounded-xl text-sm shrink-0 shadow"
            >
              + Wählen
            </button>
          </div>
        ))}
      </div>

      {/* Modal für Extras (z. B. Döner mit Scharf / ohne Zwiebeln) */}
      {modalProdukt && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl">
            <h2 className="text-xl font-black text-slate-900">{modalProdukt.name}</h2>
            <p className="text-sm text-slate-500 mb-4">
              Wähle deine Wünsche für die Zubereitung:
            </p>
            <div className="grid grid-cols-2 gap-2 mb-6">
              {EXTRA_OPTIONEN.map((extra) => {
                const aktiv = gewaehlteExtras.includes(extra);
                return (
                  <button
                    key={extra}
                    onClick={() => toggleExtra(extra)}
                    className={`p-3 rounded-xl font-bold text-sm border text-left transition ${
                      aktiv
                        ? 'bg-red-700 text-white border-red-700'
                        : 'bg-slate-100 text-slate-800 border-slate-200'
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
                className="w-1/3 py-3 rounded-xl font-bold bg-slate-200 text-slate-700"
              >
                Abbrechen
              </button>
              <button
                onClick={() => inDenWarenkorb(modalProdukt, gewaehlteExtras)}
                className="w-2/3 py-3 rounded-xl font-bold bg-red-700 text-white shadow-lg"
              >
                In den Warenkorb
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Warenkorb unten */}
      {warenkorb.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 shadow-2xl z-40">
          <div className="max-w-lg mx-auto">
            <div className="max-h-36 overflow-y-auto mb-3 space-y-2 pr-1">
              {warenkorb.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center text-sm">
                  <div>
                    <span className="font-bold">{item.menge}x {item.name}</span>
                    {item.extras && (
                      <span className="block text-xs text-red-700 font-semibold">
                        → {item.extras}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => mengeAendern(idx, -1)}
                      className="w-7 h-7 bg-slate-200 rounded-full font-bold"
                    >
                      -
                    </button>
                    <button
                      onClick={() => mengeAendern(idx, 1)}
                      className="w-7 h-7 bg-slate-200 rounded-full font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={bestellungAbsenden}
              disabled={laedt}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 rounded-2xl shadow-lg text-lg flex justify-between px-6 items-center"
            >
              <span>{laedt ? 'Wird gesendet...' : 'Bestellnummer holen'}</span>
              <span>CHF {gesamtpreis.toFixed(2)}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
