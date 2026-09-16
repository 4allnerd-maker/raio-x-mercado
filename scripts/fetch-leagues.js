// Baixa e normaliza os CSVs do football-data.co.uk para todas as ligas
// disponíveis (principais: dado completo; extras: só gols/resultado/odds).
// Gera data/leagues.json (catálogo) e data/matches/{code}.json (por liga).
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const MATCHES_DIR = path.join(DATA_DIR, 'matches');
fs.mkdirSync(MATCHES_DIR, { recursive: true });

// código -> [país, nome da liga]
const MAIN_LEAGUES = {
  E0: ['Inglaterra', 'Premier League'], E1: ['Inglaterra', 'Championship'],
  E2: ['Inglaterra', 'League One'], E3: ['Inglaterra', 'League Two'],
  SC0: ['Escócia', 'Premiership'],
  D1: ['Alemanha', 'Bundesliga'], D2: ['Alemanha', '2. Bundesliga'],
  I1: ['Itália', 'Serie A'], I2: ['Itália', 'Serie B'],
  SP1: ['Espanha', 'La Liga'], SP2: ['Espanha', 'Segunda División'],
  F1: ['França', 'Ligue 1'], F2: ['França', 'Ligue 2'],
  N1: ['Holanda', 'Eredivisie'],
  B1: ['Bélgica', 'First Division A'],
  P1: ['Portugal', 'Primeira Liga'],
  T1: ['Turquia', 'Süper Lig'],
  G1: ['Grécia', 'Super League'],
};

// candidatos de código de ligas "extra" (só gols/odds) — nem todos existem;
// os que derem 404 são ignorados automaticamente.
const EXTRA_LEAGUES = {
  BRA: ['Brasil', 'Série A'],
  ARG: ['Argentina', 'Liga Profesional'],
  MEX: ['México', 'Liga MX'],
  USA: ['EUA', 'MLS'],
  AUT: ['Áustria', 'Bundesliga'],
  CHN: ['China', 'Super League'],
  DNK: ['Dinamarca', 'Superliga'],
  FIN: ['Finlândia', 'Veikkausliiga'],
  IRL: ['Irlanda', 'Premier Division'],
  JPN: ['Japão', 'J1 League'],
  NOR: ['Noruega', 'Eliteserien'],
  POL: ['Polônia', 'Ekstraklasa'],
  ROU: ['Romênia', 'Liga I'],
  RUS: ['Rússia', 'Premier League'],
  SWE: ['Suécia', 'Allsvenskan'],
  SWZ: ['Suíça', 'Super League'],
};

const MAIN_URL_TMPL = (season, code) => `https://www.football-data.co.uk/mmz4281/${season}/${code}.csv`;
const EXTRA_URL_TMPL = (code) => `https://www.football-data.co.uk/new/${code}.csv`;
const N_SEASONS_MAIN = 10;
const N_SEASONS_EXTRA_KEEP = 10;

function seasonStartYear(d = new Date()) {
  return d.getUTCMonth() + 1 >= 7 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}
function seasonCodes(nPrevious, d = new Date()) {
  const y = seasonStartYear(d);
  const out = [];
  for (let i = 0; i <= nPrevious; i++) {
    const a = String(y - i).slice(2), b = String(y - i + 1).slice(2);
    out.push(a + b);
  }
  return out;
}

async function downloadCsv(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return null;
    let text = buf.toString('utf8');
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
    if (lines.length < 2) return null;
    const header = parseCsvLine(lines[0]);
    const rows = lines.slice(1).map((l) => {
      const cols = parseCsvLine(l);
      const obj = {};
      header.forEach((h, i) => { obj[h] = cols[i]; });
      return obj;
    });
    return rows;
  } catch (e) {
    return null;
  }
}

// parser simples de CSV (sem suporte a vírgula dentro de aspas complexas, mas
// os arquivos da football-data.co.uk não usam isso nos campos relevantes)
function parseCsvLine(line) {
  return line.split(',').map((c) => c.trim());
}

function num(v) { if (v === undefined || v === '' || v === null) return null; const n = Number(v); return Number.isFinite(n) ? n : null; }
function str(v) { return v === undefined || v === '' ? null : v; }
function parseDate(d) {
  if (!d) return null;
  const parts = d.split('/');
  if (parts.length !== 3) return null;
  let [dd, mm, yy] = parts;
  if (yy.length === 2) yy = (Number(yy) < 50 ? '20' : '19') + yy;
  return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

function normalizeMain(rows, code, season) {
  return rows.map((r) => ({
    d: parseDate(r.Date), t: str(r.Time),
    h: str(r.HomeTeam), a: str(r.AwayTeam),
    hg: num(r.FTHG), ag: num(r.FTAG), res: str(r.FTR),
    hthg: num(r.HTHG), htag: num(r.HTAG), htres: str(r.HTR),
    hs: num(r.HS), as: num(r.AS), hst: num(r.HST), ast: num(r.AST),
    hc: num(r.HC), ac: num(r.AC),
    hy: num(r.HY), ay: num(r.AY), hr: num(r.HR), ar: num(r.AR),
    season,
  })).filter((m) => m.d && m.h && m.a && m.hg !== null && m.ag !== null);
}

function normalizeExtra(rows, code) {
  return rows.map((r) => ({
    d: parseDate(r.Date), t: str(r.Time),
    h: str(r.Home), a: str(r.Away),
    hg: num(r.HG), ag: num(r.AG), res: str(r.Res),
    season: str(r.Season),
  })).filter((m) => m.d && m.h && m.a && m.hg !== null && m.ag !== null);
}

async function fetchMainLeague(code) {
  const seasons = seasonCodes(N_SEASONS_MAIN - 1);
  let all = [];
  for (const season of seasons) {
    const rows = await downloadCsv(MAIN_URL_TMPL(season, code));
    if (rows) all = all.concat(normalizeMain(rows, code, season));
  }
  return all;
}

async function fetchExtraLeague(code) {
  const rows = await downloadCsv(EXTRA_URL_TMPL(code));
  if (!rows) return null;
  const all = normalizeExtra(rows, code);
  const seasons = [...new Set(all.map((m) => m.season))].sort();
  const keep = new Set(seasons.slice(-N_SEASONS_EXTRA_KEEP));
  return all.filter((m) => keep.has(m.season));
}

async function main() {
  const catalog = [];
  const statusOk = [], statusFail = [];

  for (const code of Object.keys(MAIN_LEAGUES)) {
    const [country, leagueName] = MAIN_LEAGUES[code];
    process.stdout.write(`Baixando ${code} (${country} - ${leagueName})... `);
    const matches = await fetchMainLeague(code);
    if (!matches.length) { console.log('falhou'); statusFail.push(code); continue; }
    const teams = [...new Set(matches.flatMap((m) => [m.h, m.a]))].sort();
    fs.writeFileSync(path.join(MATCHES_DIR, `${code}.json`), JSON.stringify({ matches, teams }));
    catalog.push({
      code, country, leagueName, tier: 'principal', matchCount: matches.length, teamCount: teams.length,
      hasHT: matches.some((m) => m.hthg !== null), hasCorners: matches.some((m) => m.hc !== null), hasCards: matches.some((m) => m.hy !== null),
    });
    statusOk.push(code);
    console.log(`ok (${matches.length} jogos)`);
  }

  for (const code of Object.keys(EXTRA_LEAGUES)) {
    const [country, leagueName] = EXTRA_LEAGUES[code];
    process.stdout.write(`Baixando ${code} (${country} - ${leagueName})... `);
    const matches = await fetchExtraLeague(code);
    if (!matches || !matches.length) { console.log('indisponível'); statusFail.push(code); continue; }
    const teams = [...new Set(matches.flatMap((m) => [m.h, m.a]))].sort();
    fs.writeFileSync(path.join(MATCHES_DIR, `${code}.json`), JSON.stringify({ matches, teams }));
    catalog.push({
      code, country, leagueName, tier: 'extra', matchCount: matches.length, teamCount: teams.length,
      hasHT: false, hasCorners: false, hasCards: false,
    });
    statusOk.push(code);
    console.log(`ok (${matches.length} jogos)`);
  }

  catalog.sort((a, b) => (a.tier === b.tier ? a.country.localeCompare(b.country) : a.tier === 'principal' ? -1 : 1));
  fs.writeFileSync(path.join(DATA_DIR, 'leagues.json'), JSON.stringify({
    updatedAt: new Date().toISOString(),
    leagues: catalog,
  }, null, 2));

  console.log(`\nConcluído: ${statusOk.length} ligas ok, ${statusFail.length} indisponíveis (${statusFail.join(', ')})`);
}

main();
