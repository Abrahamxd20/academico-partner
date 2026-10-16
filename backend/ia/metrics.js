
function normalizar(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, (m) => m)
    .replace(/[^\wáéíóúüñ\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function contarSilabas(palabra) {
  const grupos = palabra.toLowerCase().match(/[aeiouáéíóúü]+/g);
  return grupos ? grupos.length : 1;
}

function contarOraciones(texto) {
  const oraciones = texto.split(/[.!?;\n]+/).map(o => o.trim()).filter(o => o.length > 0);
  return oraciones.length || 1;
}

function tokenizar(texto) {
  return normalizar(texto).split(' ').filter(w => w.length > 0);
}

// NIVEL LITERAL — Inflesz = 206.835 - (62.3 * P) - (1.015 * F)
function calcularInflesz(texto) {
  const palabras = tokenizar(texto);
  const totalPalabras = palabras.length;
  const totalSilabas = palabras.reduce((acc, p) => acc + contarSilabas(p), 0);
  const totalOraciones = contarOraciones(texto);

  if (totalPalabras === 0) {
    return { inflesz: 0, P: 0, F: 0, totalPalabras: 0, totalOraciones: 0, totalSilabas: 0 };
  }

  const P = totalSilabas / totalPalabras;
  const F = totalPalabras / totalOraciones;
  const inflesz = 206.835 - (62.3 * P) - (1.015 * F);

  return {
    inflesz: Number(inflesz.toFixed(2)),
    P: Number(P.toFixed(3)),
    F: Number(F.toFixed(3)),
    totalPalabras,
    totalOraciones,
    totalSilabas,
  };
}

// NIVEL INFERENCIAL — ROUGE-L
function longitudLCS(tokensX, tokensY) {
  const m = tokensX.length;
  const n = tokensY.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (tokensX[i - 1] === tokensY[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp[m][n];
}

function calcularRougeL(textoReferencia, textoCandidato, beta = 1) {
  const X = tokenizar(textoReferencia);
  const Y = tokenizar(textoCandidato);
  const m = X.length;
  const n = Y.length;

  if (m === 0 || n === 0) {
    return { rougeL: 0, Rlcs: 0, Plcs: 0, lcs: 0 };
  }

  const lcs = longitudLCS(X, Y);
  const Rlcs = lcs / m;
  const Plcs = lcs / n;
  const beta2 = beta * beta;
  const Flcs = (Rlcs === 0 && Plcs === 0) ? 0 : ((1 + beta2) * Rlcs * Plcs) / (Rlcs + beta2 * Plcs);

  return {
    rougeL: Number(Flcs.toFixed(4)),
    Rlcs: Number(Rlcs.toFixed(4)),
    Plcs: Number(Plcs.toFixed(4)),
    lcs,
  };
}

// NIVEL CRÍTICO — ROUGE-S
function generarSkipBigramas(tokens) {
  const pares = [];
  for (let i = 0; i < tokens.length; i++) {
    for (let j = i + 1; j < tokens.length; j++) {
      pares.push(`${tokens[i]}__${tokens[j]}`);
    }
  }
  return pares;
}

function combinatoria2(k) {
  return k < 2 ? 0 : (k * (k - 1)) / 2;
}

function calcularRougeS(textoReferencia, textoCandidato, beta = 1) {
  const X = tokenizar(textoReferencia);
  const Y = tokenizar(textoCandidato);
  const m = X.length;
  const n = Y.length;
  const Cm2 = combinatoria2(m);
  const Cn2 = combinatoria2(n);

  if (Cm2 === 0 || Cn2 === 0) {
    return { rougeS: 0, Rskip2: 0, Pskip2: 0, skip2: 0 };
  }

  const skipX = generarSkipBigramas(X);
  const skipYArr = generarSkipBigramas(Y);
  const skipYCount = {};
  skipYArr.forEach(p => { skipYCount[p] = (skipYCount[p] || 0) + 1; });

  let skip2 = 0;
  const usados = {};
  skipX.forEach(p => {
    usados[p] = usados[p] || 0;
    if (skipYCount[p] && usados[p] < skipYCount[p]) {
      skip2++;
      usados[p]++;
    }
  });

  const Rskip2 = skip2 / Cm2;
  const Pskip2 = skip2 / Cn2;
  const beta2 = beta * beta;
  const Fskip2 = (Rskip2 === 0 && Pskip2 === 0) ? 0 : ((1 + beta2) * Rskip2 * Pskip2) / (Rskip2 + beta2 * Pskip2);

  return {
    rougeS: Number(Fskip2.toFixed(4)),
    Rskip2: Number(Rskip2.toFixed(4)),
    Pskip2: Number(Pskip2.toFixed(4)),
    skip2,
  };
}

function evaluarDimensiones({ textoLiteral, referenciaInferencial, candidatoInferencial, referenciaCritico, candidatoCritico }) {
  return {
    nivelLiteral: calcularInflesz(textoLiteral || ''),
    nivelInferencial: calcularRougeL(referenciaInferencial || '', candidatoInferencial || ''),
    nivelCritico: calcularRougeS(referenciaCritico || '', candidatoCritico || ''),
  };
}

module.exports = { calcularInflesz, calcularRougeL, calcularRougeS, evaluarDimensiones };