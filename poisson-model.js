(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PoissonModel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var JANELA_DIAS = 730;
  var MIN_JOGOS_JANELA = 8;
  var MAX_GOLS_MATRIZ = 8;

  var FACT = [1];
  function factorial(n) {
    for (var i = FACT.length; i <= n; i++) FACT[i] = FACT[i - 1] * i;
    return FACT[n];
  }
  function poissonPmf(k, lam) {
    if (lam <= 0) lam = 1e-6;
    return Math.exp(-lam) * Math.pow(lam, k) / factorial(k);
  }

  function shiftDate(dateStr, days) {
    var d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function avg(arr, key) {
    if (!arr.length) return 0;
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += arr[i][key];
    return s / arr.length;
  }

  // `before`: array of matches {d,h,a,hg,ag} with d < refDateStr, sorted by date asc.
  function baselineLiga(before, refDateStr) {
    var iniStr = shiftDate(refDateStr, -JANELA_DIAS);
    var windowed = before.filter(function (m) { return m.d >= iniStr; });
    var pool = windowed.length >= 20 ? windowed : before;
    if (!pool.length) return { mediaCasa: 1.4, mediaFora: 1.1, n: 0 };
    return { mediaCasa: avg(pool, 'hg'), mediaFora: avg(pool, 'ag'), n: pool.length };
  }

  function teamStrength(before, team, refDateStr, baseline) {
    var iniStr = shiftDate(refDateStr, -JANELA_DIAS);
    var casaAll = before.filter(function (m) { return m.h === team; });
    var foraAll = before.filter(function (m) { return m.a === team; });
    var casaWin = casaAll.filter(function (m) { return m.d >= iniStr; });
    var foraWin = foraAll.filter(function (m) { return m.d >= iniStr; });

    var janelaOk = casaWin.length >= MIN_JOGOS_JANELA && foraWin.length >= MIN_JOGOS_JANELA;
    var casa = janelaOk ? casaWin : casaAll;
    var fora = janelaOk ? foraWin : foraAll;
    var nCasa = casa.length, nFora = fora.length;

    var gmCasa = nCasa ? avg(casa, 'hg') : baseline.mediaCasa;
    var gsCasa = nCasa ? avg(casa, 'ag') : baseline.mediaFora;
    var gmFora = nFora ? avg(fora, 'ag') : baseline.mediaFora;
    var gsFora = nFora ? avg(fora, 'hg') : baseline.mediaCasa;

    var ataqueCasa = baseline.mediaCasa ? gmCasa / baseline.mediaCasa : 1;
    var defesaCasa = baseline.mediaFora ? gsCasa / baseline.mediaFora : 1;
    var ataqueFora = baseline.mediaFora ? gmFora / baseline.mediaFora : 1;
    var defesaFora = baseline.mediaCasa ? gsFora / baseline.mediaCasa : 1;

    var confianca = (nCasa >= 20 && nFora >= 20) ? 'alta' : (nCasa >= 8 && nFora >= 8) ? 'media' : 'baixa';

    return { ataqueCasa: ataqueCasa, defesaCasa: defesaCasa, ataqueFora: ataqueFora, defesaFora: defesaFora, nCasa: nCasa, nFora: nFora, confianca: confianca };
  }

  function scoreMatrix(expCasa, expFora) {
    var m = [];
    for (var i = 0; i <= MAX_GOLS_MATRIZ; i++) {
      m[i] = [];
      for (var j = 0; j <= MAX_GOLS_MATRIZ; j++) m[i][j] = poissonPmf(i, expCasa) * poissonPmf(j, expFora);
    }
    return m;
  }

  // before: matches strictly before refDateStr (no leakage).
  function analisarConfronto(before, homeTeam, awayTeam, refDateStr) {
    var baseline = baselineLiga(before, refDateStr);
    var fCasa = teamStrength(before, homeTeam, refDateStr, baseline);
    var fFora = teamStrength(before, awayTeam, refDateStr, baseline);

    var expCasa = baseline.mediaCasa * fCasa.ataqueCasa * fFora.defesaFora;
    var expFora = baseline.mediaFora * fFora.ataqueFora * fCasa.defesaCasa;
    expCasa = Math.min(Math.max(expCasa, 0.15), 5.0);
    expFora = Math.min(Math.max(expFora, 0.15), 5.0);

    var matriz = scoreMatrix(expCasa, expFora);
    var pH = 0, pD = 0, pA = 0, soma = 0, pHome0 = 0, pAway0 = 0;
    for (var i = 0; i <= MAX_GOLS_MATRIZ; i++) {
      for (var j = 0; j <= MAX_GOLS_MATRIZ; j++) {
        var v = matriz[i][j];
        soma += v;
        if (i > j) pH += v; else if (i === j) pD += v; else pA += v;
        if (i === 0) pHome0 += v;
        if (j === 0) pAway0 += v;
      }
    }
    pH /= soma; pD /= soma; pA /= soma;
    var pBttsNao = pHome0 + pAway0 - (pHome0 * pAway0);
    var pBttsSim = 1 - pBttsNao;

    function pUnder(threshold) {
      var maxTotal = Math.floor(threshold);
      var p = 0;
      for (var i = 0; i <= MAX_GOLS_MATRIZ; i++) for (var j = 0; j <= MAX_GOLS_MATRIZ; j++) if (i + j <= maxTotal) p += matriz[i][j];
      return p / soma;
    }

    var confiancaDados = (fCasa.confianca === 'alta' && fFora.confianca === 'alta') ? 'alta'
      : (fCasa.confianca === 'baixa' || fFora.confianca === 'baixa') ? 'baixa' : 'media';

    return {
      expCasa: expCasa, expFora: expFora,
      prob1x2: { H: pH, D: pD, A: pA },
      probBtts: { sim: pBttsSim, nao: pBttsNao },
      pUnder: pUnder,
      confiancaDados: confiancaDados,
      amostraCasa: fCasa.nCasa, amostraFora: fFora.nFora,
      forcaCasa: fCasa, forcaFora: fFora
    };
  }

  return { analisarConfronto: analisarConfronto, poissonPmf: poissonPmf, JANELA_DIAS: JANELA_DIAS };
});
