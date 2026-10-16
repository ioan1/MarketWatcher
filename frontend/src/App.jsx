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
import { recordCreditAgricoleSnapshot } from './history.js';

function currency(value, code = 'EUR', fractionDigits = 2) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: code,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

function signedCurrency(value, code = 'EUR') {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: code,
    signDisplay: 'exceptZero',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatTime(value, timeZone) {
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(value);
}

function getMarketTimeParts(timestamp, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(timestamp);

  return Object.fromEntries(
    parts
      .filter(({ type }) => ['year', 'month', 'day', 'hour', 'minute'].includes(type))
      .map(({ type, value }) => [type, Number(value)]),
  );
}

function marketTimeToTimestamp({ year, month, day }, hour, timeZone) {
  const localAsUtc = Date.UTC(year, month - 1, day, hour);
  const displayed = getMarketTimeParts(localAsUtc, timeZone);
  const displayedAsUtc = Date.UTC(
    displayed.year,
    displayed.month - 1,
    displayed.day,
    displayed.hour,
    displayed.minute,
  );
  return localAsUtc - (displayedAsUtc - localAsUtc);
}

function buildMarketSession(history, timeZone) {
  const points = history
    .map((point) => ({ time: Date.parse(point.time), price: point.price }))
    .filter((point) => Number.isFinite(point.time));
  const sessionPoints = points.filter((point) => {
    const { hour, minute } = getMarketTimeParts(point.time, timeZone);
    const minutesSinceMidnight = hour * 60 + minute;
    return minutesSinceMidnight >= 9 * 60 && minutesSinceMidnight <= 18 * 60;
  });

  if (sessionPoints.length === 0) {
    return { data: [], start: null, end: null };
  }

  const latestSessionPoint = sessionPoints.reduce((latest, point) => (
    point.time > latest.time ? point : latest
  ));
  const sessionDate = getMarketTimeParts(latestSessionPoint.time, timeZone);
  const start = marketTimeToTimestamp(sessionDate, 9, timeZone);
  const end = marketTimeToTimestamp(sessionDate, 18, timeZone);

  return {
    data: sessionPoints.filter((point) => point.time >= start && point.time <= end),
    start,
    end,
  };
}

function QuoteTooltip({ active, payload, label, code, timeZone, includeDate = false }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="chart-tooltip">
      <span>
        {includeDate
          ? new Intl.DateTimeFormat('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            timeZone,
          }).format(label)
          : formatTime(label, timeZone)}
      </span>
      <strong>{currency(payload[0].value, code, 3)}</strong>
    </div>
  );
}

export default function App() {
  const [provider, setProvider] = useState('yahoo');
  const [symbol, setSymbol] = useState('UBI.PA');
  const [bearerToken, setBearerToken] = useState('');
  const [xAuthorizationToken, setXAuthorizationToken] = useState('');
  const [targetInput, setTargetInput] = useState('');
  const [tracked, setTracked] = useState(null);
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = tracked && quote
      ? `${tracked.symbol} ${signedCurrency(quote.targetDistance, quote.currency)} | Market Watcher`
      : 'Market Watcher';
  }, [tracked, quote]);

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
        const result = await fetchQuote(
          tracked.symbol,
          tracked.target,
          tracked.provider,
          tracked.bearerToken,
          tracked.xAuthorizationToken,
        );
        if (!active) return;
        if (tracked.provider === 'credit-agricole') {
          try {
            result.history = recordCreditAgricoleSnapshot(tracked.symbol, result);
          } catch (storageError) {
            console.error('Erreur lors de l’enregistrement de l’historique :', storageError);
            if (active) {
              setQuote(result);
              setError(
                'La cotation a été récupérée, mais son historique n’a pas pu être enregistré dans ce navigateur.',
              );
            }
            return;
          }
        }
        if (active) setQuote(result);
      } catch (requestError) {
        if (active) {
          console.error('Erreur lors du chargement de la cotation :', requestError);
          setError(requestError.message);
        }
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
    setTracked({
      symbol: normalizedSymbol,
      target,
      provider,
      bearerToken: provider === 'credit-agricole' ? bearerToken.trim() : '',
      xAuthorizationToken: provider === 'credit-agricole' ? xAuthorizationToken.trim() : '',
    });
  }

  const marketTimezone = quote?.marketTimezone;
  const chartSession = quote
    ? buildMarketSession(quote.history, marketTimezone)
    : { data: [], start: null, end: null };
  const chartData = quote?.provider === 'credit-agricole'
    ? quote.history
      .map((point) => ({ time: Date.parse(point.time), price: point.price }))
      .filter((point) => Number.isFinite(point.time))
    : chartSession.data;
  const distance = quote?.targetDistance ?? 0;
  const isAboveTarget = distance > 0;

  return (
    <main className="app-shell">
      <section className="workspace">
        <form className="watch-form" onSubmit={startTracking}>
          <label className="field-group provider-field">
            <span className="field-label">FOURNISSEUR</span>
            <span className="input-wrap">
              <select
                aria-label="Fournisseur de données"
                onChange={(event) => setProvider(event.target.value)}
                value={provider}
              >
                <option value="yahoo">Yahoo Finance</option>
                <option value="credit-agricole">Crédit Agricole</option>
              </select>
            </span>
          </label>
          <label className="field-group ticker-field">
            <span className="field-label">{provider === 'credit-agricole' ? 'ISIN' : 'SYMBOLE'}</span>
            <span className="input-wrap">
              <Search size={17} aria-hidden="true" />
              <input
                aria-label={provider === 'credit-agricole' ? 'Code ISIN' : 'Symbole boursier'}
                autoCapitalize="characters"
                autoComplete="off"
                onChange={(event) => setSymbol(event.target.value)}
                placeholder={provider === 'credit-agricole' ? 'Ex. NL00150001Q9' : 'Ex. UBI.PA'}
                spellCheck="false"
                value={symbol}
              />
            </span>
          </label>
          {provider === 'credit-agricole' && (
            <label className="field-group token-field">
              <span className="field-label">TOKEN BEARER · NON PERSISTÉ</span>
              <span className="input-wrap">
                <input
                  aria-label="Token Bearer Crédit Agricole"
                  autoComplete="new-password"
                  onChange={(event) => setBearerToken(event.target.value)}
                  placeholder="Saisir le token pour cette session"
                  type="password"
                  value={bearerToken}
                />
              </span>
            </label>
          )}
          {provider === 'credit-agricole' && (
            <label className="field-group token-field">
              <span className="field-label">TOKEN X-AUTHORIZATION · NON PERSISTÉ</span>
              <span className="input-wrap">
                <input
                  aria-label="Token X-Authorization Crédit Agricole"
                  autoComplete="new-password"
                  onChange={(event) => setXAuthorizationToken(event.target.value)}
                  placeholder="Saisir le token pour cette session"
                  type="password"
                  value={xAuthorizationToken}
                />
              </span>
            </label>
          )}
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
          <button
            className="submit-button"
            disabled={
              loading
              || !symbol.trim()
              || !targetInput
              || (provider === 'credit-agricole'
                && (!bearerToken.trim() || !xAuthorizationToken.trim()))
            }
            type="submit"
          >
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
                      <h2>{quote.displayName || quote.symbol}</h2>
                      <span className="market-badge"><span className="live-dot" /> SUIVI ACTIF</span>
                    </div>
                    <p>
                      {quote.displayName && <>{quote.symbol} <span className="separator">·</span> </>}
                      Dernière cotation <span className="separator">·</span> {quote.currency}
                    </p>
                  </div>
                </div>
                <div className="quote-metrics">
                  <div className="metric current-metric">
                    <span className="metric-label">COURS ACTUEL</span>
                    <strong>{currency(quote.currentPrice, quote.currency, 3)}</strong>
                  </div>
                  <div className="metric target-metric">
                    <span className="metric-label">OBJECTIF</span>
                    <strong>{currency(quote.target, quote.currency)}</strong>
                  </div>
                  <div className={`metric distance-metric ${isAboveTarget ? 'is-above' : 'is-below'}`}>
                    <span className="metric-label">{isAboveTarget ? 'OBJECTIF DÉPASSÉ' : 'ÉCART À L’OBJECTIF'}</span>
                    <strong>
                      {isAboveTarget ? <ArrowDownRight size={19} /> : <ArrowUpRight size={19} />}
                      {signedCurrency(distance, quote.currency)}
                    </strong>
                    <span className="metric-subvalue">
                      {quote.targetDistancePercent.toLocaleString('fr-FR', {
                        signDisplay: 'exceptZero',
                        maximumFractionDigits: 2,
                      })}%
                      {isAboveTarget ? ' au-dessus' : ' à parcourir'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="chart-section">
                <div className="chart-heading">
                  <div>
                    <h3>Évolution du cours</h3>
                    <p>
                      {quote.provider === 'credit-agricole'
                        ? 'Observations enregistrées dans ce navigateur'
                        : 'Séance de marché · 09:00–18:00'}
                    </p>
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
                        <CartesianGrid vertical={false} stroke="#303d35" strokeDasharray="3 5" />
                        <XAxis
                          axisLine={false}
                          dataKey="time"
                          domain={quote.provider === 'credit-agricole'
                            ? ['dataMin', 'dataMax']
                            : [chartSession.start, chartSession.end]}
                          tickFormatter={(value) => (quote.provider === 'credit-agricole'
                            ? new Intl.DateTimeFormat('fr-FR', {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                              timeZone: marketTimezone,
                            }).format(value)
                            : formatTime(value, marketTimezone))}
                          tickLine={false}
                          tickMargin={12}
                          tick={{ fill: '#9ba99f', fontSize: 11 }}
                          type="number"
                          ticks={quote.provider === 'credit-agricole'
                            ? undefined
                            : Array.from(
                              { length: 7 },
                              (_, index) => chartSession.start
                                + index * (chartSession.end - chartSession.start) / 6,
                            )}
                        />
                        <YAxis
                          axisLine={false}
                          domain={['auto', 'auto']}
                          tickFormatter={(value) => new Intl.NumberFormat('fr-FR', {
                            minimumFractionDigits: 3,
                            maximumFractionDigits: 3,
                          }).format(value)}
                          tickLine={false}
                          tick={{ fill: '#9ba99f', fontSize: 11 }}
                          width={68}
                        />
                        <Tooltip
                          content={(
                            <QuoteTooltip
                              code={quote.currency}
                              includeDate={quote.provider === 'credit-agricole'}
                              timeZone={marketTimezone}
                            />
                          )}
                        />
                        <ReferenceLine
                          y={quote.target}
                          stroke="#da765f"
                          strokeDasharray="5 5"
                          strokeWidth={1.5}
                        />
                        <Line
                          activeDot={{ r: 5, fill: '#59c99c', stroke: '#e5eee8', strokeWidth: 2 }}
                          dataKey="price"
                          dot={quote.provider === 'credit-agricole' && chartData.length === 1}
                          isAnimationActive={false}
                          stroke="#59c99c"
                          strokeWidth={2.5}
                          type="monotone"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="chart-empty">
                      Aucune observation enregistrée pour cette valeur.
                    </div>
                  )}
                </div>
                <div className="chart-footnote">
                  <span><Clock3 size={14} /> Actualisé {formatTime(Date.parse(quote.fetchedAt))}</span>
                  <span>
                    {quote.provider === 'credit-agricole'
                      ? `${chartData.length} observations enregistrées`
                      : `${chartData.length} points de cotation`}
                  </span>
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