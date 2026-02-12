/**
 * SPRT (Sequential Probability Ratio Test) calculation module
 *
 * This implementation is inspired by the Python project:
 *   vdbergh/pentanomial — https://github.com/vdbergh/pentanomial
 *
 * MIT License
 *
 * Copyright 2019-2020 Michel Van den Bergh
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

export type SPRT = {
  llr: number;
  lowerBound: number;
  upperBound: number;
};

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

// PDF: Probability Density Function (values and probabilities)
type PDF = [number, number][];

function pdfStats(pdf: PDF): { mean: number; variance: number } {
  const mean = pdf.reduce((m, [v, p]) => m + p * v, 0);
  const variance = pdf.reduce((acc, [v, p]) => acc + p * (v - mean) ** 2, 0);
  return { mean, variance };
}

const eloScale = (Math.SQRT2 * Math.log(10)) / 800;

// Maximum Likelihood Estimation of PDF under Elo hypothesis
// Reference: https://www.cantate.be/Fishtest/normalized_elo_practical.pdf
function mle(pdfhat: PDF, elo: number): PDF {
  const tStar = elo * eloScale;
  const muRef = 0.5;
  const l = pdfhat.length;

  // Start with uniform distribution as P0 (safer than pdfhat per section 4.1)
  let pdf: PDF = pdfhat.map(([v]) => [v, 1 / l]);

  for (let iter = 0; iter < 16; iter++) {
    const { mean: mu, variance } = pdfStats(pdf);
    const sigma = Math.sqrt(variance);
    if (sigma < 1e-15) break;

    // φ_i(P) = a_i - μ_ref - (1/2) * t* * σ * (1 + ((a_i - μ)/σ)²)  [section 4.1]
    const phi = pdf.map(
      ([ai]) => ai - muRef - 0.5 * tStar * sigma * (1 + ((ai - mu) / sigma) ** 2),
    );

    const u = Math.min(...phi);
    const v = Math.max(...phi);
    if (u * v >= 0) break;

    // Solve Σ p̂_i * φ_i / (1 + θ * φ_i) = 0 for θ ∈ (-1/v, -1/u)  [equation 4.9]
    const eps = 1e-9;
    const theta = brentq(
      (t) => pdfhat.reduce((sum, [, pi], i) => sum + (pi * phi[i]) / (1 + t * phi[i]), 0),
      -1 / v + eps,
      -1 / u - eps,
    );

    // p_{n+1,i} = p̂_i / (1 + θ * φ_i)  [equation 4.10]
    const newPdf: PDF = pdfhat.map(([val, pi], i) => [val, pi / (1 + theta * phi[i])]);
    const diff = newPdf.reduce((s, [, p], i) => s + Math.abs(p - pdf[i][1]), 0);
    pdf = newPdf;
    if (diff < 1e-10) break;
  }

  return pdf;
}

// Calculate SPRT LLR(Log-Likelihood Ratio) and its bounds
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

  // Regularization to avoid zero counts
  const reg = results.map((r) => (r === 0 ? 1e-3 : r));

  // Total number of games
  const N = reg.reduce((s, x) => s + x, 0);

  // Build PDF
  // [[0.0, p0], [0.25, p1], [0.5, p2], [0.75, p3], [1.0, p4]]
  const pdf: PDF = reg.map((r, i) => [i / 4, r / N]);

  // MLE under both hypotheses
  const pdf0 = mle(pdf, config.elo0);
  const pdf1 = mle(pdf, config.elo1);

  // Compute log-likelihood ratio
  const mean = pdf.reduce(
    (m, [, pi], i) => m + pi * (Math.log(pdf1[i][1]) - Math.log(pdf0[i][1])),
    0,
  );
  const llr = N * mean;

  return { llr, lowerBound, upperBound };
}
