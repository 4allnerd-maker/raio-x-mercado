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

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/csv,*/*',
};

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function downloadCsv(url, attempt = 1) {
  try {
    const res = await fetch(url, { headers: FETCH_HEADERS });
    if (!res.ok) {
      if (attempt < 3) { await sleep(1500 * attempt); return downloadCsv(url, attempt + 1); }
      return null;
    }
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
    if (attempt < 3) { await sleep(1500 * attempt); return downloadCsv(url, attempt + 1); }
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

function computeAggregates(matches) {
  const n = matches.length;
  if (!n) return null;
  let goals = 0, btts = 0, over25 = 0, hWin = 0, draw = 0, aWin = 0;
  for (const m of matches) {
    const total = m.hg + m.ag;
    goals += total;
    if (m.hg > 0 && m.ag > 0) btts++;
    if (total > 2.5) over25++;
    if (m.res === 'H') hWin++; else if (m.res === 'D') draw++; else if (m.res === 'A') aWin++;
  }
  return {
    avgGoals: +(goals / n).toFixed(2),
    pctBtts: +(btts / n * 100).toFixed(1),
    pctOver25: +(over25 / n * 100).toFixed(1),
    pctHomeWin: +(hWin / n * 100).toFixed(1),
    pctDraw: +(draw / n * 100).toFixed(1),
    pctAwayWin: +(aWin / n * 100).toFixed(1),
  };
}

const FIXTURES_URL = 'https://www.football-data.co.uk/fixtures.csv';

async function fetchFixtures() {
  const rows = await downloadCsv(FIXTURES_URL);
  if (!rows) return [];
  return rows.map((r) => {
    const code = str(r.Div);
    if (!code || !MAIN_LEAGUES[code]) return null;
    const [country, leagueName] = MAIN_LEAGUES[code];
    const d = parseDate(r.Date);
    const h = str(r.HomeTeam), a = str(r.AwayTeam);
    if (!d || !h || !a) return null;
    return {
      code, country, leagueName, d, t: str(r.Time), h, a,
      oddsH: num(r.AvgH), oddsD: num(r.AvgD), oddsA: num(r.AvgA),
    };
  }).filter(Boolean);
}

// Protege contra fonte instável/bloqueada devolvendo um CSV vazio ou truncado:
// só sobrescreve o arquivo de uma liga se o resultado novo não for muito menor
// que o que já está salvo (o que indicaria falha parcial, não dado real).
function existingMatchCount(code) {
  const file = path.join(MATCHES_DIR, `${code}.json`);
  if (!fs.existsSync(file)) return 0;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')).matches.length; } catch (e) { return 0; }
}

function loadOldCatalog() {
  const file = path.join(DATA_DIR, 'leagues.json');
  if (!fs.existsSync(file)) return {};
  try {
    const byCode = {};
    JSON.parse(fs.readFileSync(file, 'utf8')).leagues.forEach((l) => { byCode[l.code] = l; });
    return byCode;
  } catch (e) { return {}; }
}

async function main() {
  const oldCatalog = loadOldCatalog();
  const catalog = [];
  const statusOk = [], statusFail = [];

  function handleFailure(code) {
    statusFail.push(code);
    if (oldCatalog[code]) { catalog.push(oldCatalog[code]); console.log('falhou (mantendo entrada anterior no catálogo)'); }
    else console.log('falhou (sem entrada anterior pra manter)');
  }

  for (const code of Object.keys(MAIN_LEAGUES)) {
    const [country, leagueName] = MAIN_LEAGUES[code];
    process.stdout.write(`Baixando ${code} (${country} - ${leagueName})... `);
    const matches = await fetchMainLeague(code);
    const previous = existingMatchCount(code);
    if (!matches.length || matches.length < previous * 0.5) { handleFailure(code); continue; }
    const teams = [...new Set(matches.flatMap((m) => [m.h, m.a]))].sort();
    fs.writeFileSync(path.join(MATCHES_DIR, `${code}.json`), JSON.stringify({ matches, teams }));
    catalog.push({
      code, country, leagueName, tier: 'principal', matchCount: matches.length, teamCount: teams.length,
      hasHT: matches.some((m) => m.hthg !== null), hasCorners: matches.some((m) => m.hc !== null), hasCards: matches.some((m) => m.hy !== null),
      agg: computeAggregates(matches),
      seasons: [...new Set(matches.map((m) => m.season))].sort(),
    });
    statusOk.push(code);
    console.log(`ok (${matches.length} jogos)`);
  }

  for (const code of Object.keys(EXTRA_LEAGUES)) {
    const [country, leagueName] = EXTRA_LEAGUES[code];
    process.stdout.write(`Baixando ${code} (${country} - ${leagueName})... `);
    const matches = await fetchExtraLeague(code);
    const previous = existingMatchCount(code);
    if (!matches || !matches.length || matches.length < previous * 0.5) { handleFailure(code); continue; }
    const teams = [...new Set(matches.flatMap((m) => [m.h, m.a]))].sort();
    fs.writeFileSync(path.join(MATCHES_DIR, `${code}.json`), JSON.stringify({ matches, teams }));
    catalog.push({
      code, country, leagueName, tier: 'extra', matchCount: matches.length, teamCount: teams.length,
      hasHT: false, hasCorners: false, hasCards: false,
      agg: computeAggregates(matches),
      seasons: [...new Set(matches.map((m) => m.season))].sort(),
    });
    statusOk.push(code);
    console.log(`ok (${matches.length} jogos)`);
  }

  // Trava de segurança: se a fonte estiver fora do ar / bloqueando (ex.: IP da
  // CI bloqueado), aborta sem escrever nada em vez de publicar um catálogo vazio.
  if (statusOk.length < Object.keys(MAIN_LEAGUES).length + Object.keys(EXTRA_LEAGUES).length) {
    console.log(`\nAVISO: só ${statusOk.length} de ${Object.keys(MAIN_LEAGUES).length + Object.keys(EXTRA_LEAGUES).length} ligas atualizaram (${statusFail.join(', ')}) — mantendo dado anterior pra essas.`);
  }
  if (statusOk.length === 0) {
    console.error('\nERRO: nenhuma liga foi baixada com sucesso (fonte fora do ar ou bloqueando essa rede?). Abortando sem alterar os dados.');
    process.exit(1);
  }

  process.stdout.write('Baixando calendário de próximos jogos (ligas principais)... ');
  const fixtures = await fetchFixtures();
  const oldFixturesFile = path.join(DATA_DIR, 'fixtures.json');
  const oldFixturesCount = fs.existsSync(oldFixturesFile) ? (JSON.parse(fs.readFileSync(oldFixturesFile, 'utf8')).fixtures || []).length : 0;
  if (fixtures.length > 0 || oldFixturesCount === 0) {
    fs.writeFileSync(oldFixturesFile, JSON.stringify({ updatedAt: new Date().toISOString(), fixtures }));
    console.log(`ok (${fixtures.length} jogos futuros)`);
  } else {
    console.log(`0 jogos futuros — mantendo calendário anterior (${oldFixturesCount} jogos) pra não apagar um calendário válido por uma falha pontual`);
  }

  catalog.sort((a, b) => (a.tier === b.tier ? a.country.localeCompare(b.country) : a.tier === 'principal' ? -1 : 1));
  fs.writeFileSync(path.join(DATA_DIR, 'leagues.json'), JSON.stringify({
    updatedAt: new Date().toISOString(),
    leagues: catalog,
  }, null, 2));

  console.log(`\nConcluído: ${statusOk.length} ligas ok, ${statusFail.length} indisponíveis (${statusFail.join(', ')})`);
}

main();
