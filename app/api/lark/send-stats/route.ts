import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@larksuiteoapi/node-sdk';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

const PROJECTS_PATH = path.resolve(process.cwd(), 'config/projects.json');
const BLOCKSCOUT_GRAPHQL = 'https://hashkey.blockscout.com/api/v1/graphql';

// Lark 配置
const LARK_APP_ID = 'cli_a8d8554e1d389029';
const LARK_APP_SECRET = 'kNV486E3z4sGiPJxLdQEuM14ubTrBhu1';

const client = new Client({
  appId: LARK_APP_ID,
  appSecret: LARK_APP_SECRET,
});

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

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

function createStatsCard(projectStats: any[], timestamp: string) {
  const totalGas = projectStats.reduce((sum, p) => sum + p.totalGasUsed, 0);
  const totalTx = projectStats.reduce((sum, p) => sum + p.totalTransactionsCount, 0);
  const totalTransfers = projectStats.reduce((sum, p) => sum + p.totalTokenTransfersCount, 0);

  const elements = [
    {
      tag: "div",
      text: {
        tag: "plain_text",
        content: `📊 HashKey Chain 项目统计报告\n🕐 更新时间: ${new Date(timestamp).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n\n📈 总览统计:\n• 项目总数: ${projectStats.length}\n• Gas消耗: ${formatNumber(totalGas)}\n• 交易总数: ${formatNumber(totalTx)}\n• 转账总数: ${formatNumber(totalTransfers)}`
      }
    },
    {
      tag: "hr"
    }
  ];

  // 添加每个项目的统计
  projectStats.forEach((project, index) => {
    const rank = index + 1;
    const rankEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}️⃣`;
    
    elements.push({
      tag: "div",
      text: {
        tag: "plain_text",
        content: `${rankEmoji} ${project.name}\n📄 ${project.description}\n💰 Gas消耗: ${formatNumber(project.totalGasUsed)}\n📈 交易数: ${formatNumber(project.totalTransactionsCount)}\n🔄 转账数: ${formatNumber(project.totalTokenTransfersCount)}\n📋 合约数: ${project.contractCount}`
      }
    });

    if (index < projectStats.length - 1) {
      elements.push({ tag: "hr" });
    }
  });

  return {
    msg_type: "interactive",
    card: {
      elements: elements,
      header: {
        title: {
          tag: "plain_text",
          content: "🚀 HashKey Chain 生态统计"
        },
        template: "blue"
      }
    }
  };
}

// POST /api/lark/send-stats
export async function POST(req: NextRequest) {
  try {
    const { chat_id, user_id } = await req.json();
    
    if (!chat_id && !user_id) {
      return NextResponse.json({ error: 'chat_id 或 user_id 必须提供其中一个' }, { status: 400 });
    }

    // 获取项目统计数据
    const projects = getProjects();
    const projectStats = [];

    for (const project of projects) {
      const addresses = project.contract_address;
      let totalGasUsed = 0;
      let totalTransactionsCount = 0;
      let totalTokenTransfersCount = 0;

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

    // 创建消息卡片
    const timestamp = new Date().toISOString();
    const card = createStatsCard(projectStats, timestamp);

    // 发送消息
    const receiveIdType: 'chat_id' | 'user_id' = chat_id ? 'chat_id' : 'user_id';
    const response = await client.im.message.create({
      data: {
        receive_id: chat_id || user_id,
        msg_type: card.msg_type,
        content: JSON.stringify(card.card)
      },
      params: {
        receive_id_type: receiveIdType
      }
    });

    return NextResponse.json({
      success: true,
      message: '统计消息已发送',
      lark_response: response
    });

  } catch (error) {
    console.error('发送 Lark 消息失败:', error);
    return NextResponse.json({
      error: '发送消息失败',
      details: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 });
  }
} 