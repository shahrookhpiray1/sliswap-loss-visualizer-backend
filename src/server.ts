import express from 'express';
import cors from 'cors';

const app = express();
const PORT = Number(process.env.PORT) || 10000;

// =======================
// ✅ CORS — کاملاً سازگار با Browser
// =======================
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  })
);

// 👇 بسیار مهم برای preflight
app.options('*', cors());

app.use(express.json());

// =======================
// Config
// =======================

const SLISWAP_API = 'https://www.sliswap.com/api';

const POOLS: Record<string, string> = {
  'EDS/USDT': '6ayE94veQ41KD4S87piMvxvYhmiEww4fz54wwRaMjBp5',
  'USDT/VDEP': 'AzSp299Yy9mMEnhGZF4gUaZN19qdgZqcKJ5rTzV6CadR',
};

// =======================
// Helpers
// =======================

async function fetchPoolStats(poolAddress: string) {
  const res = await fetch(`${SLISWAP_API}/v1/pool/stats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chain: 2, // Endless
      poolAddress,
    }),
  });

  if (!res.ok) {
    throw new Error('Failed to fetch pool stats');
  }

  const json = await res.json();

  if (json.code !== '0') {
    throw new Error(json.msg || 'SliSwap API error');
  }

  return json.data;
}

// =======================
// API
// =======================

app.post('/api/calculate', async (req, res) => {
  try {
    const { from, to, amount } = req.body as {
      from: string;
      to: string;
      amount: number;
    };

    if (!from || !to || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'Invalid input' });
    }

    const pairKey =
      POOLS[`${from}/${to}`]
        ? `${from}/${to}`
        : POOLS[`${to}/${from}`]
        ? `${to}/${from}`
        : null;

    if (!pairKey) {
      return res.status(400).json({ error: 'Unsupported pair' });
    }

    const poolAddress = POOLS[pairKey];
    const stats = await fetchPoolStats(poolAddress);

    const base = stats.baseValue;
    const quote = stats.quoteValue;
    const feePercent = Number(stats.fee); // e.g. 0.24

    let reserveIn: number;
    let reserveOut: number;

    if (from === base.symbol) {
      reserveIn = Number(base.amount);
      reserveOut = Number(quote.amount);
    } else {
      reserveIn = Number(quote.amount);
      reserveOut = Number(base.amount);
    }

    // ===== Calculations =====

    const marketPrice = reserveOut / reserveIn;
    const marketExpected = amount * marketPrice;

    const feeRate = feePercent / 100;
    const amountAfterFee = amount * (1 - feeRate);

    const actualAmount =
      (amountAfterFee * reserveOut) /
      (reserveIn + amountAfterFee);

    const loss = marketExpected - actualAmount;
    const slippagePercent = (loss / marketExpected) * 100;

    res.json({
      marketExpected,
      idealAmount: marketExpected,
      actualAmount,
      totalSlippage: slippagePercent,
      feeSlippage: feePercent,
    });
  } catch (err: any) {
    console.error('❌ API Error:', err);
    res.status(500).json({ error: err.message || 'Internal error' });
  }
});

// =======================
// Start Server
// =======================

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Backend running on port ${PORT}`);
});
