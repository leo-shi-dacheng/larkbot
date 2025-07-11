import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';

const ETH_MAINNET_RPC_URL = 'https://ethereum.public.blockpi.network/v1/rpc/public'; // 使用您提供的 RPC 端点
const BRIDGES_PATH = path.resolve(process.cwd(), 'config/bridges.json');

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

type BridgeConfig = {
  name: string;
  contract_address: {
    liquidityMonitor: string;
    hskToken: string;
  };
  logo: string;
  chain: string;
  description: string;
};

function getBridgeConfigs(): BridgeConfig[] {
  const data = fs.readFileSync(BRIDGES_PATH, 'utf-8');
  return JSON.parse(data);
}

export async function getBridgeLiquidity() {
  const provider = new ethers.JsonRpcProvider(ETH_MAINNET_RPC_URL);
  const bridgeConfigs = getBridgeConfigs();
  const results: any[] = [];

  for (const config of bridgeConfigs) {
    const { name, contract_address } = config;
    const { liquidityMonitor, hskToken } = contract_address;

    if (!ethers.isAddress(liquidityMonitor) || !ethers.isAddress(hskToken)) {
      results.push({
        name,
        error: '流动性监控地址或 HSK 代币地址无效',
        liquidityMonitor,
        hskToken
      });
      continue;
    }

    try {
      const hskContract = new ethers.Contract(hskToken, ERC20_ABI, provider);
      const balance = await hskContract.balanceOf(liquidityMonitor);
      const decimals = await hskContract.decimals();
      const symbol = await hskContract.symbol();

      results.push({
        name,
        balance: ethers.formatUnits(balance, decimals),
        symbol,
        rawBalance: balance.toString(),
        liquidityMonitor,
        hskToken
      });
    } catch (e) {
      console.error(`查询 ${name} 流动性失败:`, e);
      results.push({
        name,
        error: `查询失败: ${e instanceof Error ? e.message : '未知错误'}`,
        liquidityMonitor,
        hskToken
      });
    }
  }
  return results;
}
