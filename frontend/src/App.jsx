import { useEffect, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Clock3,
  LoaderCircle,
  Search,
  Target,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchQuote } from './api.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function currency(value, code = 'EUR') {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatTime(value) {
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

function QuoteTooltip({ active, payload, label, code }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="chart-tooltip">
      <span>{formatTime(label)}</span>
      <strong>{currency(payload[0].value, code)}</strong>
    </div>
  );
}

export default function App() {
  const [symbol, setSymbol] = useState('UBI.PA');
  const [targetInput, setTargetInput] = useState('');
  const [tracked, setTracked] = useState(null);
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!tracked) return undefined;

    let active = true;
    let requestInFlight = false;

    async function refresh(isInitial = false) {
      if (requestInFlight) return;
      requestInFlight = true;
      if (isInitial) setLoading(true);
      setError('');

      try {
        const result = await fetchQuote(tracked.symbol, tracked.target);
        if (active) setQuote(result);
      } catch (requestError) {
        if (active) setError(requestError.message);
      } finally {
        requestInFlight = false;
        if (active && isInitial) setLoading(false);
      }
    }

    refresh(true);
    const interval = window.setInterval(() => refresh(), 30_000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [tracked]);

  function startTracking(event) {
    event.preventDefault();
    const normalizedSymbol = symbol.trim().toUpperCase();
    const target = Number(targetInput.replace(',', '.'));
    if (!normalizedSymbol || !Number.isFinite(target) || target <= 0) return;

    setQuote(null);
    setError('');
    setTracked({ symbol: normalizedSymbol, target });
  }

  const chartData = quote?.history.map((point) => ({
    time: Date.parse(point.time),
    price: point.price,
  }));
  const distance = quote?.targetDistance ?? 0;
  const isAboveTarget = distance <= 0;

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Market Watcher, accueil">
          <span className="brand-mark"><Activity size={19} strokeWidth={2.4} /></span>
          <span>market<span className="brand-light">watcher</span></span>
        </a>
        <div className="topbar-meta">
          <span className="live-dot" />
          <span>Surveillance active</span>
        </div>
      </header>

      <section className="workspace">
        <div className="page-heading">
          <div>
            <p className="eyebrow">TABLEAU DE BORD <span> / </span> MARCHÉS</p>
            <h1>Suivi de marché</h1>
          </div>
          <div className="source-note"><span className="source-mark">Y</span> Données Yahoo Finance</div>
        </div>

        <form className="watch-form" onSubmit={startTracking}>
          <label className="field-group ticker-field">
            <span className="field-label">SYMBOLE</span>
            <span className="input-wrap">
              <Search size={17} aria-hidden="true" />
              <input
                aria-label="Symbole boursier"
                autoCapitalize="characters"
                autoComplete="off"
                onChange={(event) => setSymbol(event.target.value)}
                placeholder="Ex. UBI.PA"
                spellCheck="false"
                value={symbol}
              />
            </span>
          </label>
          <label className="field-group target-field">
            <span className="field-label">COURS CIBLE · DEVISE DU TITRE</span>
            <span className="input-wrap target-input-wrap">
              <Target size={17} aria-hidden="true" />
              <input
                aria-label="Cours cible"
                inputMode="decimal"
                min="0.01"
                onChange={(event) => setTargetInput(event.target.value)}
                placeholder="0,00"
                step="any"
                type="number"
                value={targetInput}
              />
            </span>
          </label>
          <button className="submit-button" disabled={loading || !symbol.trim() || !targetInput} type="submit">
            {loading ? <LoaderCircle className="spin" size={17} /> : <Activity size={17} />}
            <span>{loading ? 'Chargement' : 'Suivre le cours'}</span>
          </button>
        </form>

        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            {tracked && <button onClick={() => setTracked({ ...tracked })} type="button">Réessayer</button>}
          </div>
        )}

        <section className="market-panel" aria-label="Cours et graphique">
          {quote ? (
            <>
              <div className="quote-overview">
                <div className="instrument-heading">
                  <div className="instrument-icon"><Activity size={21} /></div>
                  <div>
                    <div className="ticker-line">
                      <h2>{quote.symbol}</h2>
                      <span className="market-badge"><span className="live-dot" /> SUIVI ACTIF</span>
                    </div>
                    <p>Dernière cotation <span className="separator">·</span> {quote.currency}</p>
                  </div>
                </div>
                <div className="quote-metrics">
                  <div className="metric current-metric">
                    <span className="metric-label">COURS ACTUEL</span>
                    <strong>{currency(quote.currentPrice, quote.currency)}</strong>
                  </div>
                  <div className="metric target-metric">
                    <span className="metric-label">OBJECTIF</span>
                    <strong>{currency(quote.target, quote.currency)}</strong>
                  </div>
                  <div className={`metric distance-metric ${isAboveTarget ? 'is-above' : 'is-below'}`}>
                    <span className="metric-label">{isAboveTarget ? 'OBJECTIF DÉPASSÉ' : 'ÉCART À L’OBJECTIF'}</span>
                    <strong>
                      {isAboveTarget ? <ArrowDownRight size={19} /> : <ArrowUpRight size={19} />}
                      {currency(Math.abs(distance), quote.currency)}
                    </strong>
                    <span className="metric-subvalue">
                      {Math.abs(quote.targetDistancePercent).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}%
                      {isAboveTarget ? ' au-dessus' : ' à parcourir'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="chart-section">
                <div className="chart-heading">
                  <div>
                    <h3>Évolution du cours</h3>
                    <p>Fenêtre glissante de 24 heures</p>
                  </div>
                  <div className="chart-legend">
                    <span><i className="legend-line price-line" /> Cours</span>
                    <span><i className="legend-line target-line" /> Objectif</span>
                  </div>
                </div>
                <div className="chart-frame">
                  {chartData?.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 14, right: 12, bottom: 2, left: 4 }}>
                        <CartesianGrid vertical={false} stroke="#e7e9e4" strokeDasharray="3 5" />
                        <XAxis
                          axisLine={false}
                          dataKey="time"
                          domain={[Date.now() - DAY_MS, Date.now()]}
                          tickFormatter={formatTime}
                          tickLine={false}
                          tickMargin={12}
                          tick={{ fill: '#878d88', fontSize: 11 }}
                          type="number"
                          ticks={Array.from({ length: 7 }, (_, index) => Date.now() - DAY_MS + index * DAY_MS / 6)}
                        />
                        <YAxis
                          axisLine={false}
                          domain={['auto', 'auto']}
                          tickFormatter={(value) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value)}
                          tickLine={false}
                          tick={{ fill: '#878d88', fontSize: 11 }}
                          width={68}
                        />
                        <Tooltip content={<QuoteTooltip code={quote.currency} />} />
                        <ReferenceLine y={quote.target} stroke="#da765f" strokeDasharray="5 5" strokeWidth={1.5} />
                        <Line
                          activeDot={{ r: 5, fill: '#187b68', stroke: '#ffffff', strokeWidth: 2 }}
                          dataKey="price"
                          dot={false}
                          isAnimationActive={false}
                          stroke="#187b68"
                          strokeWidth={2.5}
                          type="monotone"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="chart-empty">Aucune cotation disponible dans cette période.</div>
                  )}
                </div>
                <div className="chart-footnote">
                  <span><Clock3 size={14} /> Actualisé {formatTime(Date.parse(quote.fetchedAt))}</span>
                  <span>{quote.history.length} points de cotation</span>
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <div className="empty-icon"><Target size={23} /></div>
              <p>{loading ? 'Récupération des cotations' : error ? 'Cotation indisponible' : 'Prêt à suivre'}</p>
              {loading && <LoaderCircle className="spin empty-loader" size={17} />}
            </div>
          )}
        </section>

        <footer className="page-footer">
          <span>Market Watcher <span className="separator">·</span> Cotations indicatives</span>
          <span>Actualisation automatique toutes les 30 secondes</span>
        </footer>
      </section>
    </main>
  );
}