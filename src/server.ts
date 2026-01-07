import express from 'express';
import cors from 'cors';

const app = express();
const PORT = Number(process.env.PORT) || 10000;

// =======================
// CORS — کاملاً سازگار با Browser + GitHub Pages
// =======================
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

app.options('*', (_req, res) => res.sendStatus(200));
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
    body: JSON.stringify({ chain: 2, poolAddress }),
  });

  const json = await res.json();
  if (!res.ok || json.code !== '0') {
    throw new Error(json.msg || 'SliSwap API error');
  }
  return json.data;
}

// =======================
// API (⚠️ بدون /api)
// =======================
app.post('/calculate', async (req, res) => {
  try {
    const { from, to, amount } = req.body;

    if (!from || !to || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'Invalid input' });
    }

    const pairKey =
      POOLS[`${from}/${to}`] ? `${from}/${to}` :
      POOLS[`${to}/${from}`] ? `${to}/${from}` : null;

    if (!pairKey) {
      return res.status(400).json({ error: 'Unsupported pair' });
    }

    const stats = await fetchPoolStats(POOLS[pairKey]);
    const base = stats.baseValue;
    const quote = stats.quoteValue;
    const feePercent = Number(stats.fee);

    const [reserveIn, reserveOut] =
      from === base.symbol
        ? [Number(base.amount), Number(quote.amount)]
        : [Number(quote.amount), Number(base.amount)];

    const marketExpected = amount * (reserveOut / reserveIn);
    const amountAfterFee = amount * (1 - feePercent / 100);

    const actualAmount =
      (amountAfterFee * reserveOut) / (reserveIn + amountAfterFee);

    const totalSlippage =
      ((marketExpected - actualAmount) / marketExpected) * 100;

    res.json({
      marketExpected,
      idealAmount: marketExpected,
      actualAmount,
      totalSlippage,
      feeSlippage: feePercent,
    });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// =======================
app.listen(PORT, '0.0.0.0', () =>
  console.log(`✅ Backend running on ${PORT}`)
);
