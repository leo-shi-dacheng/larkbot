import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

const BLOCKSCOUT_GRAPHQL = 'https://hashkey.blockscout.com/api/v1/graphql';
const BLOCKSCOUT_API = 'https://hashkey.blockscout.com/api/v2';

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
  // API 查询似乎有问题，直接使用估算方法
  const currentTime = Date.now();
  const currentBlock = await getCurrentBlock();
  
  // 估算区块号 (2秒一个区块)
  const timeDiff = (currentTime - timestamp) / 1000; // 秒
  const blockDiff = Math.floor(timeDiff / 2); // 2秒一个区块
  
  return Math.max(1, currentBlock - blockDiff);
}

// 测试 GraphQL 查询
async function testGraphQLQuery(hash: string, fromBlock?: number, toBlock?: number) {
  // 测试不同的查询方式
  const queries = [
    // 1. 简单查询（不带区块范围）
    {
      name: "简单查询",
      query: `{ address(hash: "${hash}") { hash gasUsed transactionsCount tokenTransfersCount } }`
    },
    // 2. 带区块范围的查询（如果支持）
    fromBlock && toBlock ? {
      name: "区块范围查询",
      query: `{
        address(hash: "${hash}") {
          transactions(first: 10) {
            edges {
              node {
                gasUsed
                blockNumber
              }
            }
          }
        }
      }`
    } : null,
    // 3. 只查询交易
    {
      name: "交易查询",
      query: `{
        address(hash: "${hash}") {
          transactions(first: 10) {
            edges {
              node {
                gasUsed
                blockNumber
              }
            }
          }
        }
      }`
    }
  ].filter(Boolean);

  const results = [];
  
  for (const queryTest of queries) {
    try {
      const { data } = await axios.post(BLOCKSCOUT_GRAPHQL, {
        query: queryTest!.query
      }, {
        headers: { 'Content-Type': 'application/json' }
      });
      
      results.push({
        name: queryTest!.name,
        success: true,
        data: data
      });
    } catch (e) {
      results.push({
        name: queryTest!.name,
        success: false,
        error: e instanceof Error ? e.message : '未知错误'
      });
    }
  }
  
  return results;
}

// GET /api/debug/blocks
export async function GET(req: NextRequest) {
  try {
    const now = new Date();
    // Create a date string for today in China (e.g., "2025-07-11")
    const todayDateString = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Create the date for today at midnight in China (UTC+8)
    const today0AM = new Date(`${todayDateString}T00:00:00.000+08:00`);

    const yesterday0AM = new Date(today0AM.getTime() - 24 * 60 * 60 * 1000);
    const dayBefore0AM = new Date(yesterday0AM.getTime() - 24 * 60 * 60 * 1000);

    console.log('调试时间范围:', {
      dayBefore0AM: dayBefore0AM.toISOString(),
      yesterday0AM: yesterday0AM.toISOString(),
      today0AM: today0AM.toISOString()
    });

    // 获取当前区块
    const currentBlock = await getCurrentBlock();
    
    // 获取对应的区块号
    const [dayBeforeBlock, yesterdayBlock, todayBlock] = await Promise.all([
      getBlockByTimestamp(dayBefore0AM.getTime()),
      getBlockByTimestamp(yesterday0AM.getTime()),
      getBlockByTimestamp(today0AM.getTime())
    ]);

    // 测试一个合约地址的查询
    const testHash = "0xebaeA4c7D2301c3a5d308e92cd0Ad2d1E62AAEA0"; // Cellula 的 mainContract
    const graphqlResults = await testGraphQLQuery(testHash, yesterdayBlock, todayBlock);

    return NextResponse.json({
      success: true,
      debug: {
        currentTime: now.toISOString(),
        currentBlock,
        timePoints: {
          dayBefore0AM: dayBefore0AM.toISOString(),
          yesterday0AM: yesterday0AM.toISOString(),
          today0AM: today0AM.toISOString()
        },
        blocks: {
          dayBeforeBlock,
          yesterdayBlock,
          todayBlock,
          blockDifferences: {
            yesterdayToToday: todayBlock - yesterdayBlock,
            dayBeforeToYesterday: yesterdayBlock - dayBeforeBlock
          }
        },
        estimatedBlocksPerDay: 43200, // 2秒/块 * 60秒 * 60分 * 24小时 / 2
        testContract: testHash,
        graphqlResults
      }
    });

  } catch (error) {
    console.error('调试失败:', error);
    return NextResponse.json({
      error: '调试失败',
      details: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 });
  }
} 