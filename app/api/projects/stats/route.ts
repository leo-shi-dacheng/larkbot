import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

const PROJECTS_PATH = path.resolve(process.cwd(), 'config/projects.json');
const BLOCKSCOUT_GRAPHQL = 'https://hashkey.blockscout.com/api/v1/graphql';

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

// GET /api/projects/stats - 返回适合 Lark Bot 消息卡片的项目统计数据
export async function GET(req: NextRequest) {
  const projects = getProjects();
  const projectStats = [];

  for (const project of projects) {
    const addresses = project.contract_address;
    let totalGasUsed = 0;
    let totalTransactionsCount = 0;
    let totalTokenTransfersCount = 0;

    // 并发请求所有合约数据
    const promises = Object.entries(addresses).map(async ([name, hash]) => {
      const query = {
        query: `{ address(hash: "${hash}") { gasUsed transactionsCount tokenTransfersCount } }`
      };
      
      try {
        const { data } = await axios.post(BLOCKSCOUT_GRAPHQL, query, {
          headers: { 'Content-Type': 'application/json' }
        });
        
        const addressData = (data as any).data.address;
        return {
          gasUsed: addressData?.gasUsed || 0,
          transactionsCount: addressData?.transactionsCount || 0,
          tokenTransfersCount: addressData?.tokenTransfersCount || 0
        };
      } catch (e) {
        return {
          gasUsed: 0,
          transactionsCount: 0,
          tokenTransfersCount: 0
        };
      }
    });

    // 等待所有请求完成并汇总
    const results = await Promise.all(promises);
    results.forEach(result => {
      totalGasUsed += result.gasUsed;
      totalTransactionsCount += result.transactionsCount;
      totalTokenTransfersCount += result.tokenTransfersCount;
    });

    projectStats.push({
      name: project.name,
      logo: project.logo,
      description: project.description,
      contractCount: Object.keys(addresses).length,
      totalGasUsed,
      totalTransactionsCount,
      totalTokenTransfersCount
    });
  }

  // 按交易数量排序
  projectStats.sort((a, b) => b.totalTransactionsCount - a.totalTransactionsCount);

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    totalProjects: projects.length,
    projects: projectStats
  });
} 