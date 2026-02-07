export type SPRT = {
  llr: number;
  lowerBound: number;
  upperBound: number;
};

// PDF is represented as an array of [value, probability] pairs.
type PDF = [number, number][];

const neloOverNt = 800 / Math.log(10); // 347.43558...

/**
 * Brent's method for root finding on [a, b].
 * Equivalent to scipy.optimize.brentq.
 */
function brentq(f: (x: number) => number, a: number, b: number, tol = 1e-12, maxIter = 100) {
  let fa = f(a);
  let fb = f(b);
  if (fa * fb > 0) {
    throw new Error("brentq: f(a) and f(b) must have opposite signs");
  }
  let c = a;
  let fc = fa;
  let d = b - a;
  let e = d;
  for (let i = 0; i < maxIter; i++) {
    if (fb * fc > 0) {
      c = a;
      fc = fa;
      d = b - a;
      e = d;
    }
    if (Math.abs(fc) < Math.abs(fb)) {
      a = b;
      b = c;
      c = a;
      fa = fb;
      fb = fc;
      fc = fa;
    }
    const tol1 = 2 * Number.EPSILON * Math.abs(b) + 0.5 * tol;
    const m = 0.5 * (c - b);
    if (Math.abs(m) <= tol1 || fb === 0) {
      return b;
    }
    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      const s_ = fb / fa;
      let p: number, q: number;
      if (a === c) {
        // secant
        p = 2 * m * s_;
        q = 1 - s_;
      } else {
        // inverse quadratic interpolation
        const q_ = fa / fc;
        const r = fb / fc;
        p = s_ * (2 * m * q_ * (q_ - r) - (b - a) * (r - 1));
        q = (q_ - 1) * (r - 1) * (s_ - 1);
      }
      if (p > 0) {
        q = -q;
      } else {
        p = -p;
      }
      if (2 * p < Math.min(3 * m * q - Math.abs(tol1 * q), Math.abs(e * q))) {
        e = d;
        d = p / q;
      } else {
        d = m;
        e = m;
      }
    } else {
      d = m;
      e = m;
    }
    a = b;
    fa = fb;
    if (Math.abs(d) > tol1) {
      b += d;
    } else {
      b += m > 0 ? tol1 : -tol1;
    }
    fb = f(b);
  }
  return b;
}

/**
 * Solve the secular equation: sum_i pi*ai/(1+x*ai) = 0.
 */
function secular(pdf: PDF): number {
  const epsilon = 1e-9;
  const values = pdf.map(([ai]) => ai);
  const v = Math.min(...values);
  const w = Math.max(...values);
  const lowerBound = -1 / w;
  const upperBound = -1 / v;
  const f = (x: number) => pdf.reduce((s, [ai, pi]) => s + (pi * ai) / (1 + x * ai), 0);
  return brentq(f, lowerBound + epsilon, upperBound - epsilon);
}

/**
 * Compute mean and variance of a discrete distribution.
 */
function pdfStats(pdf: PDF): [number, number] {
  const s = pdf.reduce((acc, [value, prob]) => acc + prob * value, 0);
  const variance = pdf.reduce((acc, [value, prob]) => acc + prob * (value - s) ** 2, 0);
  return [s, variance];
}

/**
 * Return a uniform distribution over the same support as pdf.
 */
function uniform(pdf: PDF): PDF {
  const n = pdf.length;
  return pdf.map(([ai]) => [ai, 1 / n]);
}

/**
 * Compute the MLE distribution with a given t-value ((mu-ref)/sigma).
 */
function mleTValue(pdfhat: PDF, ref: number, s: number): PDF {
  let pdfMLE = uniform(pdfhat);
  for (let iter = 0; iter < 10; iter++) {
    const prev = pdfMLE;
    const [mu, variance] = pdfStats(pdfMLE);
    const sigma = Math.sqrt(variance);
    const pdf1: PDF = pdfhat.map(([ai, pi]) => [
      ai - ref - (s * sigma * (1 + ((mu - ai) / sigma) ** 2)) / 2,
      pi,
    ]);
    const x = secular(pdf1);
    pdfMLE = pdfhat.map(([ai, pi], i) => [ai, pi / (1 + x * pdf1[i][0])]);
    const maxDiff = Math.max(...prev.map(([, pi], i) => Math.abs(pi - pdfMLE[i][1])));
    if (maxDiff < 1e-9) {
      break;
    }
  }
  return pdfMLE;
}

/**
 * Compute the LLR jumps for a t-value test.
 */
function llrJumpsTValue(pdf: PDF, ref: number, t0: number, t1: number): PDF {
  const pdf0 = mleTValue(pdf, ref, t0);
  const pdf1 = mleTValue(pdf, ref, t1);
  return pdf.map(([, pi], i) => [Math.log(pdf1[i][1]) - Math.log(pdf0[i][1]), pi]);
}

/**
 * Regularize results: replace zeros with a small epsilon.
 */
function regularize(results: number[]): number[] {
  const epsilon = 1e-3;
  return results.map((r) => (r === 0 ? epsilon : r));
}

/**
 * Convert results array to [N, PDF].
 */
function resultsToPdf(results: number[]): [number, PDF] {
  const reg = regularize(results);
  const N = reg.reduce((s, x) => s + x, 0);
  const count = reg.length;
  return [N, reg.map((r, i) => [i / (count - 1), r / N])];
}

/**
 * Compute the exact generalized log-likelihood ratio for pentanomial results
 * using the t-value statistic. Equivalent to LLR_normalized in LLRcalc.py.
 */
function llrNormalized(nelo0: number, nelo1: number, results: number[]): number {
  const nt0 = nelo0 / neloOverNt;
  const nt1 = nelo1 / neloOverNt;
  const sqrt2 = Math.SQRT2;
  let t0: number, t1: number;
  if (results.length === 3) {
    t0 = nt0;
    t1 = nt1;
  } else if (results.length === 5) {
    t0 = nt0 * sqrt2;
    t1 = nt1 * sqrt2;
  } else {
    throw new Error("results must have length 3 or 5");
  }
  const [N, pdf] = resultsToPdf(results);
  const jumps = llrJumpsTValue(pdf, 0.5, t0, t1);
  const [mean] = pdfStats(jumps);
  return N * mean;
}

export function calculateSPRT(
  pentanomial: {
    loseLose: number;
    loseDraw: number;
    drawDrawOrWinLose: number;
    winDraw: number;
    winWin: number;
  },
  config: {
    elo0: number;
    elo1: number;
    alpha: number;
    beta: number;
  },
): SPRT {
  const upperBound = Math.log((1 - config.beta) / config.alpha);
  const lowerBound = Math.log(config.beta / (1 - config.alpha));
  const results = [
    pentanomial.loseLose,
    pentanomial.loseDraw,
    pentanomial.drawDrawOrWinLose,
    pentanomial.winDraw,
    pentanomial.winWin,
  ];
  const llr = llrNormalized(config.elo0, config.elo1, results);
  return { llr, lowerBound, upperBound };
}
