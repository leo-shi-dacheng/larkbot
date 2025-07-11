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

// GET /api/contracts?project=xxx
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectName = searchParams.get('project');
  const projects = getProjects();

  // 统计所有合约地址总数
  if (!projectName) {
    let total = 0;
    projects.forEach((p: Project) => {
      if (typeof p.contract_address === 'object') {
        total += Object.keys(p.contract_address).length;
      }
    });
    return NextResponse.json({ total });
  }

  // 查询单个项目详情
  const project = projects.find((p: Project) => p.name.toLowerCase() === projectName.toLowerCase());
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const addresses = project.contract_address;
  const results: Record<string, any> = {};

  for (const [name, hash] of Object.entries(addresses)) {
    const query = {
      query: `{ address(hash: "${hash}") { hash gasUsed transactionsCount tokenTransfersCount } }`
    };
    try {
      const { data } = await axios.post(BLOCKSCOUT_GRAPHQL, query, {
        headers: { 'Content-Type': 'application/json' }
      });
      const addressData = (data as any).data.address;
      results[name] = {
        hash: addressData?.hash || hash,
        gasUsed: addressData?.gasUsed || 0,
        transactionsCount: addressData?.transactionsCount || 0,
        tokenTransfersCount: addressData?.tokenTransfersCount || 0
      };
    } catch (e) {
      results[name] = { 
        hash: hash,
        gasUsed: 0,
        transactionsCount: 0,
        tokenTransfersCount: 0,
        error: 'Failed to fetch' 
      };
    }
  }

  return NextResponse.json({ project: project.name, stats: results });
} 