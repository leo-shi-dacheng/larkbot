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

// GET /api/contracts/total - 返回所有项目所有合约的汇总统计
export async function GET(req: NextRequest) {
  const projects = getProjects();
  
  let totalGasUsed = 0;
  let totalTransactionsCount = 0;
  let totalTokenTransfersCount = 0;
  let totalContracts = 0;
  
  const projectStats: Record<string, any> = {};

  for (const project of projects) {
    const addresses = project.contract_address;
    let projectGasUsed = 0;
    let projectTransactionsCount = 0;
    let projectTokenTransfersCount = 0;
    
    const contractStats: Record<string, any> = {};

    for (const [name, hash] of Object.entries(addresses)) {
      const query = {
        query: `{ address(hash: "${hash}") { hash gasUsed transactionsCount tokenTransfersCount } }`
      };
      
      try {
        const { data } = await axios.post(BLOCKSCOUT_GRAPHQL, query, {
          headers: { 'Content-Type': 'application/json' }
        });
        
        const addressData = (data as any).data.address;
        const gasUsed = addressData?.gasUsed || 0;
        const transactionsCount = addressData?.transactionsCount || 0;
        const tokenTransfersCount = addressData?.tokenTransfersCount || 0;
        
        contractStats[name] = {
          hash: addressData?.hash || hash,
          gasUsed,
          transactionsCount,
          tokenTransfersCount
        };
        
        projectGasUsed += gasUsed;
        projectTransactionsCount += transactionsCount;
        projectTokenTransfersCount += tokenTransfersCount;
        totalContracts++;
        
      } catch (e) {
        contractStats[name] = { 
          hash: hash,
          gasUsed: 0,
          transactionsCount: 0,
          tokenTransfersCount: 0,
          error: 'Failed to fetch' 
        };
        totalContracts++;
      }
    }
    
    projectStats[project.name] = {
      logo: project.logo,
      chain: project.chain,
      description: project.description,
      contractCount: Object.keys(addresses).length,
      totalGasUsed: projectGasUsed,
      totalTransactionsCount: projectTransactionsCount,
      totalTokenTransfersCount: projectTokenTransfersCount,
      contracts: contractStats
    };
    
    totalGasUsed += projectGasUsed;
    totalTransactionsCount += projectTransactionsCount;
    totalTokenTransfersCount += projectTokenTransfersCount;
  }

  return NextResponse.json({
    summary: {
      totalProjects: projects.length,
      totalContracts,
      totalGasUsed,
      totalTransactionsCount,
      totalTokenTransfersCount
    },
    projects: projectStats
  });
} 