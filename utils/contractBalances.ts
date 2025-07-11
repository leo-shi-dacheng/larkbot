import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';

const RPC_URL = 'https://mainnet.hsk.xyz'; // 您的 RPC 端点
const PROJECTS_PATH = path.resolve(process.cwd(), 'config/projects.json');

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

export async function getContractBalances() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const projects = getProjects();
  const allBalances: any[] = [];

  for (const project of projects) {
    const projectBalances: { [key: string]: string } = {};
    for (const [name, address] of Object.entries(project.contract_address)) {
      if (!ethers.isAddress(address)) {
        projectBalances[name] = '不是有效的以太坊地址';
        console.warn(`跳过 ${project.name} - ${name} (${address}): 不是有效的以太坊地址`);
        continue;
      }
      try {
        const balance = await provider.getBalance(address);
        projectBalances[name] = ethers.formatEther(balance); // 格式化为以太币单位
      } catch (e) {
        console.error(`查询 ${project.name} - ${name} (${address}) 余额失败:`, e);
        projectBalances[name] = `查询失败: ${e instanceof Error ? e.message : '未知错误'}`;
      }
    }
    allBalances.push({
      projectName: project.name,
      contractBalances: projectBalances,
    });
  }
  return allBalances;
}
