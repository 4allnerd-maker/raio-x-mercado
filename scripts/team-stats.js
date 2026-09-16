// Pré-calcula, por liga/time/condição, a taxa de acerto dos mercados "core"
// (gols e resultado) nos últimos 10 jogos e no histórico completo. Usado
// pela página de Rankings pra não precisar baixar os jogos crus de 34 ligas
// no navegador só pra montar um ranking.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const MATCHES_DIR = path.join(DATA_DIR, 'matches');
const OUT_DIR = path.join(DATA_DIR, 'team-stats');
fs.mkdirSync(OUT_DIR, { recursive: true });

const MERCADOS = [
  { key: 'over05', hit: (m) => (m.hg + m.ag) > 0.5 },
  { key: 'over15', hit: (m) => (m.hg + m.ag) > 1.5 },
  { key: 'over25', hit: (m) => (m.hg + m.ag) > 2.5 },
  { key: 'over35', hit: (m) => (m.hg + m.ag) > 3.5 },
  { key: 'under25', hit: (m) => (m.hg + m.ag) < 2.5 },
  { key: 'under35', hit: (m) => (m.hg + m.ag) < 3.5 },
  { key: 'btts', hit: (m) => m.hg > 0 && m.ag > 0 },
  { key: 'vitoria', hit: (m, c) => (c === 'mandante' ? m.res === 'H' : m.res === 'A') },
  { key: 'naoperder', hit: (m, c) => (c === 'mandante' ? m.res !== 'A' : m.res !== 'H') },
];

function rate(matches, mercado, condicao) {
  const n = matches.length;
  if (!n) return { r: null, n: 0 };
  const hits = matches.filter((m) => mercado.hit(m, condicao)).length;
  return { r: +(hits / n * 100).toFixed(1), n };
}

function main() {
  const files = fs.readdirSync(MATCHES_DIR).filter((f) => f.endsWith('.json'));
  for (const file of files) {
    const code = file.replace('.json', '');
    const db = JSON.parse(fs.readFileSync(path.join(MATCHES_DIR, file), 'utf8'));
    const matches = db.matches.slice().sort((a, b) => b.d.localeCompare(a.d)); // mais recente primeiro
    const out = {};

    for (const team of db.teams) {
      out[team] = {};
      for (const condicao of ['mandante', 'visitante']) {
        const played = matches.filter((m) => (condicao === 'mandante' ? m.h === team : m.a === team));
        const last10 = played.slice(0, 10);
        const entry = {};
        for (const mercado of MERCADOS) {
          const full = rate(played, mercado, condicao);
          const l10 = rate(last10, mercado, condicao);
          entry[mercado.key] = { rFull: full.r, nFull: full.n, r10: l10.r, n10: l10.n };
        }
        out[team][condicao] = entry;
      }
    }

    fs.writeFileSync(path.join(OUT_DIR, `${code}.json`), JSON.stringify(out));
  }
  console.log(`Team-stats gerado para ${files.length} ligas.`);
}

main();
