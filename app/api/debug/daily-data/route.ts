import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { getContractBalances } from '@utils/contractBalances';
import { getBridgeLiquidity } from '@utils/bridgeLiquidity';

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

// 获取某一页的交易数据
async function fetchTransactionsPage(hash: string, startBlock: number, endBlock: number, after: string | null) {
  const query = {
    query: `query AddressStatsInBlockRange($hash: AddressHash!, $startBlock: Int!, $endBlock: Int!, $after: String) {
      address(hash: $hash) {
        transactions(
          first: 100,
          after: $after,
          filter: {
            blockNumber: {
              gte: $startBlock,
              lte: $endBlock
            }
          }
        ) {
          edges {
            cursor
            node {
              gasUsed
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }`,
    variables: { hash, startBlock, endBlock, after }
  };
  const { data } = await axios.post(BLOCKSCOUT_GRAPHQL, query, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 10000
  });
  return (data as any).data?.address.transactions;
}

// 获取合约在指定区块范围内的统计数据
async function getContractDailyStats(hash: string, startBlock: number, endBlock: number) {
  let allTransactions: any[] = [];
  let hasNextPage = true;
  let afterCursor = null;

  while (hasNextPage) {
    const transactionsData = await fetchTransactionsPage(hash, startBlock, endBlock, afterCursor);
    if (transactionsData && transactionsData.edges) {
      allTransactions = allTransactions.concat(transactionsData.edges);
      hasNextPage = transactionsData.pageInfo.hasNextPage;
      afterCursor = transactionsData.pageInfo.endCursor;
    } else {
      hasNextPage = false;
    }
  }

  const stats = allTransactions.reduce((acc, edge) => {
    acc.gasUsed += Number(edge.node.gasUsed);
    return acc;
  }, { gasUsed: 0 });

  return {
    gasUsed: stats.gasUsed,
    transactionsCount: allTransactions.length,
    tokenTransfersCount: 0 // The current query does not fetch token transfers
  };
}

// 获取项目的统计数据
async function getProjectStats(project: Project, startBlock: number, endBlock: number) {
  const addresses = project.contract_address;
  let totalGasUsed = 0;
  let totalTransactionsCount = 0;
  let totalTokenTransfersCount = 0;

  const results = [];
  for (const [name, hash] of Object.entries(addresses)) {
    const contractStats = await getContractDailyStats(hash, startBlock, endBlock);
    results.push(contractStats);
  }
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

// GET /api/debug/daily-data 今天当天数据
// GET /api/debug/daily-data?date=yesterday 昨天一整天数据
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date');

    const targetDate = new Date();
    if (dateParam === 'yesterday') {
      targetDate.setDate(targetDate.getDate() - 1);
    }
    targetDate.setHours(0, 0, 0, 0);
    const startOfDayTimestamp = targetDate.getTime();

    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);
    const endOfDayTimestamp = endOfDay.getTime();

    const startBlock = await getBlockByTimestamp(startOfDayTimestamp);
    const endBlock = await getBlockByTimestamp(endOfDayTimestamp);
    console.log("startBlock, endBlock",startBlock, endBlock);
    const projects = getProjects();

    // 获取每日统计数据
    const dailyStats: any[] = [];
    for (const project of projects) {
      const projectStats = await getProjectStats(project, startBlock, endBlock);
      dailyStats.push(projectStats);
    }

    // 获取合约余额数据
    const contractBalances = await getContractBalances();

    // 获取桥接流动性数据
    const bridgeLiquidity = await getBridgeLiquidity();
    
    return NextResponse.json({
      dailyStats: dailyStats,
      summary: {
        totalProjects: dailyStats.length,
        totalGasUsed: dailyStats.reduce((sum, p) => sum + p.totalGasUsed, 0),
        totalTransactionsCount: dailyStats.reduce((sum, p) => sum + p.totalTransactionsCount, 0),
        totalTokenTransfersCount: dailyStats.reduce((sum, p) => sum + p.totalTokenTransfersCount, 0)
      },
      contractBalances: contractBalances, // 添加合约余额数据
      bridgeLiquidity: bridgeLiquidity // 添加桥接流动性数据
    });
  } catch (error) {
    return NextResponse.json({ error: '统计失败', details: error instanceof Error ? error.message : '未知错误' }, { status: 500 });
  }
}
