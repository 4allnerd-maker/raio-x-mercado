// Backtest walk-forward do motor Poisson, rodado por liga. Para cada jogo,
// usa só os jogos ANTERIORES aquela data para prever, depois compara com o
// resultado real. Gera uma tabela de calibração (prob prevista x acerto real)
// por liga e por mercado, salva em data/calibracao.json.
const fs = require('fs');
const path = require('path');
const PoissonModel = require('./poisson-model.js');

const DATA_DIR = path.join(__dirname, 'data');
const MATCHES_DIR = path.join(DATA_DIR, 'matches');
const WARMUP_MIN_MATCHES = 380; // ~ 1 temporada, pra dar tempo do modelo ter histórico mínimo

const buckets = [
  { min: 0.0, max: 0.55, label: '<55%' },
  { min: 0.55, max: 0.60, label: '55-60%' },
  { min: 0.60, max: 0.65, label: '60-65%' },
  { min: 0.65, max: 0.70, label: '65-70%' },
  { min: 0.70, max: 0.80, label: '70-80%' },
  { min: 0.80, max: 1.01, label: '80%+' },
];

function bucketize(list) {
  const out = buckets.map((b) => ({ ...b, n: 0, hits: 0 }));
  for (const p of list) {
    if (p.conf !== 'alta') continue;
    for (const b of out) {
      if (p.prob >= b.min && p.prob < b.max) { b.n++; if (p.hit) b.hits++; break; }
    }
  }
  return out.map((b) => ({ faixa: b.label, n: b.n, taxaAcerto: b.n ? +(b.hits / b.n * 100).toFixed(1) : null }));
}

function backtestLeague(matches) {
  matches = matches.slice().sort((a, b) => a.d.localeCompare(b.d));
  const groups = [];
  let curDate = null, curGroup = null;
  for (const m of matches) {
    if (m.d !== curDate) { curGroup = []; groups.push({ d: m.d, items: curGroup }); curDate = m.d; }
    curGroup.push(m);
  }

  const preds = { mo1x2: [], over05: [], over15: [], over25: [], over35: [], btts: [] };
  const accumulated = [];

  for (const g of groups) {
    if (accumulated.length >= WARMUP_MIN_MATCHES) {
      for (const m of g.items) {
        const c = PoissonModel.analisarConfronto(accumulated, m.h, m.a, m.d);
        const totalGols = m.hg + m.ag;

        const ordenado = Object.entries(c.prob1x2).sort((a, b) => b[1] - a[1]);
        const favorito = ordenado[0][0], probFav = ordenado[0][1];
        const realResultado = m.hg > m.ag ? 'H' : m.hg === m.ag ? 'D' : 'A';
        preds.mo1x2.push({ prob: probFav, conf: c.confiancaDados, hit: favorito === realResultado });

        [0.5, 1.5, 2.5, 3.5].forEach((th) => {
          const pUnder = c.pUnder(th);
          const pOver = 1 - pUnder;
          const favoreceOver = pOver >= pUnder;
          const prob = favoreceOver ? pOver : pUnder;
          const hit = favoreceOver ? totalGols > th : totalGols < th;
          preds['over' + String(th).replace('.', '')].push({ prob, conf: c.confiancaDados, hit });
        });

        const favoreceSim = c.probBtts.sim >= c.probBtts.nao;
        const probBtts = favoreceSim ? c.probBtts.sim : c.probBtts.nao;
        const realBtts = m.hg > 0 && m.ag > 0;
        preds.btts.push({ prob: probBtts, conf: c.confiancaDados, hit: favoreceSim === realBtts });
      }
    }
    accumulated.push(...g.items);
  }

  const calibracao = {};
  for (const key of Object.keys(preds)) {
    calibracao[key] = { n_total: preds[key].length, faixas: bucketize(preds[key]) };
  }
  return calibracao;
}

function main() {
  const files = fs.readdirSync(MATCHES_DIR).filter((f) => f.endsWith('.json'));
  const out = {};
  for (const file of files) {
    const code = file.replace('.json', '');
    const db = JSON.parse(fs.readFileSync(path.join(MATCHES_DIR, file), 'utf8'));
    if (db.matches.length < WARMUP_MIN_MATCHES + 50) {
      console.log(`${code}: pulado (amostra pequena, ${db.matches.length} jogos)`);
      continue;
    }
    const t0 = Date.now();
    out[code] = backtestLeague(db.matches);
    console.log(`${code}: ok (${db.matches.length} jogos, ${Date.now() - t0}ms)`);
  }
  fs.writeFileSync(path.join(DATA_DIR, 'calibracao.json'), JSON.stringify(out));
  console.log('Salvo em data/calibracao.json');
}

main();
