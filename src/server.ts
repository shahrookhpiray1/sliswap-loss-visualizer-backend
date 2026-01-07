import express from 'express';
import { Endless, EndlessConfig, Network } from '@endlesslab/endless-ts-sdk';

const app = express();
const PORT = parseInt(process.env.PORT || '10000', 10);

// CORS: فقط برای دموی GitHub Pages
app.use((_, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://shahrookhpiray1.github.io');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

app.use(express.json());

const config = new EndlessConfig({ network: Network.MAINNET });
const endless = new Endless(config);

const POOL_ADDRESSES = {
  'EDS/USDT': '0x52fe2d47e68de101b84826dce2a09d9d37e2fd2256aa8cda13931ba07cf33082',
  'USDT/VDEP': '0x947079020ff7a80396813db930dc2731182d7d7601c253a5f44248446287aaac',
};

const METADATA = {
  USDT: '0x0707313fc6e87b5bad0bb90b65dbfe13522fde9e71261e91ab76e93fff707934',
  EDS: '0xc69712057e634bebc9ab02745d2d69ee738e3eb4f5d30189a9acbf8e08fb823e',
  VDEP: '0x073a178b234acfa232c3c44fd94a32076d4f8a53dba143d99f3bafc84a05620d',
};

const DECIMALS = { USDT: 6, EDS: 8, VDEP: 8 };

function toAtomic(amount: number, decimals: number): bigint {
  return BigInt(Math.floor(amount * 10 ** decimals));
}

function fromAtomic(amount: bigint, decimals: number): number {
  return Number(amount) / (10 ** decimals);
}

async function getAmountOut(pool: string, tokenIn: string, amount: number): Promise<number> {
  const decimalsIn = DECIMALS[tokenIn as keyof typeof DECIMALS];
  const amountIn = toAtomic(amount, decimalsIn);
  
  const res = await endless.view({
    payload: {
      function: '0x4198e1871cf459faceccb3d3e86882d7337d17badb0626a33538674385f6e5f4::liquidity_pool::get_amount_out',
      typeArguments: [],
      functionArguments: [pool, METADATA[tokenIn as keyof typeof METADATA], amountIn.toString()],
    },
  });

  if (!res || !res[0]) throw new Error('Empty response');

  const outToken =
    pool === POOL_ADDRESSES['EDS/USDT']
      ? tokenIn === 'EDS' ? 'USDT' : 'EDS'
      : tokenIn === 'USDT' ? 'VDEP' : 'USDT';

  return fromAtomic(BigInt(res[0] as string), DECIMALS[outToken as keyof typeof DECIMALS]);
}

app.post('/api/calculate', async (req, res) => {
  try {
    const { from, to, amount } = req.body as { from: string; to: string; amount: number };
    if (!from || !to || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'Invalid input' });
    }

    let actual = 0;
    if ((from === 'EDS' && to === 'USDT') || (from === 'USDT' && to === 'EDS')) {
      actual = await getAmountOut(POOL_ADDRESSES['EDS/USDT'], from, amount);
    } else if ((from === 'USDT' && to === 'VDEP') || (from === 'VDEP' && to === 'USDT')) {
      actual = await getAmountOut(POOL_ADDRESSES['USDT/VDEP'], from, amount);
    } else {
      return res.status(400).json({ error: 'Unsupported pair' });
    }

    const fee = from === 'VDEP' || to === 'VDEP' ? 0.24 : 0.12;
    const marketExpected = actual / (1 - fee / 100);

    res.json({
      marketExpected,
      idealAmount: marketExpected,
      actualAmount: actual,
      totalSlippage: fee,
      feeSlippage: fee,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to calculate swap' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend running on port ${PORT}`);
});