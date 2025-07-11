import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const PROJECTS_PATH = path.resolve(process.cwd(), 'config/projects.json');
const BLOCKSCOUT_GRAPHQL = 'https://hashkey.blockscout.com/api/v1/graphql';
const BLOCKSCOUT_API = 'https://hashkey.blockscout.com/api/v2';

type Project = {
  name: string;
  contract_address: Record<string, string>;
  logo: string;
  chain: string;
  description: string;
};

function getProjects(): Project[] {
  const data = fs.readFileSync(PROJECTS_PATH, 'utf-8');
  return JSON.parse(data).projects;
}

// 获取当前最新区块号
async function getCurrentBlock(): Promise<number> {
  try {
    const response = await axios.get(`${BLOCKSCOUT_API}/blocks?limit=1`);
    if ((response.data as any).items && (response.data as any).items.length > 0) {
      return parseInt((response.data as any).items[0].height);
    }
  } catch (e) {
    console.error('获取当前区块号失败:', e);
  }
  return 1000000; // 默认值
}

// 获取指定时间戳对应的区块号
async function getBlockByTimestamp(timestamp: number): Promise<number> {
  const currentTime = Date.now();
  const currentBlock = await getCurrentBlock();
  
  // 估算区块号 (2秒一个区块)
  const timeDiff = (currentTime - timestamp) / 1000; // 秒
  const blockDiff = Math.floor(timeDiff / 2); // 2秒一个区块
  
  const estimatedBlock = Math.max(1, currentBlock - blockDiff);
  return estimatedBlock;
}

// 获取合约的总统计数据（不考虑区块号）
async function getContractTotalStats(hash: string) {
  const query = {
    query: `{
      address(hash: "${hash}") {
        gasUsed
        transactionsCount
        tokenTransfersCount
      }
    }`
  };
  try {
    const { data } = await axios.post(BLOCKSCOUT_GRAPHQL, query, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });
    const addressData = (data as any).data?.address;
    return {
      gasUsed: addressData?.gasUsed || 0,
      transactionsCount: addressData?.transactionsCount || 0,
      tokenTransfersCount: addressData?.tokenTransfersCount || 0
    };
  } catch (e) {
    return { gasUsed: 0, transactionsCount: 0, tokenTransfersCount: 0 };
  }
}

// 获取项目的总统计数据（不考虑区块号）
async function getProjectTotalStats(project: Project) {
  const addresses = project.contract_address;
  let totalGasUsed = 0;
  let totalTransactionsCount = 0;
  let totalTokenTransfersCount = 0;

  const promises = Object.entries(addresses).map(async ([name, hash]) => {
    return await getContractTotalStats(hash);
  });

  const results = await Promise.all(promises);
  results.forEach(result => {
    totalGasUsed += Number(result.gasUsed);
    totalTransactionsCount += Number(result.transactionsCount);
    totalTokenTransfersCount += Number(result.tokenTransfersCount);
  });

  return {
    name: project.name,
    totalGasUsed,
    totalTransactionsCount,
    totalTokenTransfersCount
  };
}

// GET /api/debug/daily-data
export async function GET(req: NextRequest) {
  try {
    const projects = getProjects();
    const statsPromises = projects.map(project => getProjectTotalStats(project));
    const stats = await Promise.all(statsPromises);
    return NextResponse.json({
      projects: stats,
      summary: {
        totalProjects: stats.length,
        totalGasUsed: stats.reduce((sum, p) => sum + p.totalGasUsed, 0),
        totalTransactionsCount: stats.reduce((sum, p) => sum + p.totalTransactionsCount, 0),
        totalTokenTransfersCount: stats.reduce((sum, p) => sum + p.totalTokenTransfersCount, 0)
      }
    });
  } catch (error) {
    return NextResponse.json({ error: '统计失败', details: error instanceof Error ? error.message : '未知错误' }, { status: 500 });
  }
} 