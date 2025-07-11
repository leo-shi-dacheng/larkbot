import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@larksuiteoapi/node-sdk';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

const PROJECTS_PATH = path.resolve(process.cwd(), 'config/projects.json');
const BLOCKSCOUT_GRAPHQL = 'https://hashkey.blockscout.com/api/v1/graphql';
const BLOCKSCOUT_API = 'https://hashkey.blockscout.com/api/v2';

// Lark 配置
const LARK_APP_ID = 'cli_a8d859d61f79d029';
const LARK_APP_SECRET = 'tKH9XTd7AQreOJEKnhw40gf7TiOshD0b';

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

// 获取指定时间戳对应的区块号
async function getBlockByTimestamp(timestamp: number): Promise<number> {
  // 使用估算方法，因为 API 查询似乎有问题
  const currentTime = Date.now();
  const currentBlock = await getCurrentBlock();
  
  // 估算区块号 (2秒一个区块)
  const timeDiff = (currentTime - timestamp) / 1000; // 秒
  const blockDiff = Math.floor(timeDiff / 2); // 2秒一个区块
  
  const estimatedBlock = Math.max(1, currentBlock - blockDiff);
  
  console.log(`时间戳 ${new Date(timestamp).toISOString()} 对应区块号: ${estimatedBlock} (当前区块: ${currentBlock}, 时间差: ${timeDiff}秒, 区块差: ${blockDiff})`);
  
  return estimatedBlock;
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

// 获取合约截止到指定区块的累积统计数据
async function getContractCumulativeStats(hash: string, toBlock: number) {
  const query = {
    query: `{
      address(hash: "${hash}") {
        transactions(first: 1000) {
          edges {
            node {
              gasUsed
              blockNumber
              hash
            }
          }
        }
        tokenTransfers(first: 1000) {
          edges {
            node {
              blockNumber
              amount
            }
          }
        }
      }
    }`
  };

  try {
    const { data } = await axios.post(BLOCKSCOUT_GRAPHQL, query, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000 // 10秒超时
    });

    console.log(`GraphQL 响应:`, JSON.stringify(data, null, 2));

    // 检查响应结构
    if (!(data as any) || !(data as any).data) {
      console.error('GraphQL 响应格式错误:', data);
      return {
        gasUsed: 0,
        transactionsCount: 0,
        tokenTransfersCount: 0
      };
    }

    const addressData = (data as any).data.address;
    if (!addressData) {
      console.error('地址数据为空:', hash);
      return {
        gasUsed: 0,
        transactionsCount: 0,
        tokenTransfersCount: 0
      };
    }

    const allTransactions = addressData.transactions?.edges || [];
    const allTransfers = addressData.tokenTransfers?.edges || [];

    console.log(`合约 ${hash}: 总交易 ${allTransactions.length}, 总转账 ${allTransfers.length}`);

    // 过滤截止到指定区块的所有交易（累积数据）
    const cumulativeTransactions = allTransactions.filter((tx: any) => {
      const blockNum = parseInt(tx.node.blockNumber);
      return blockNum <= toBlock;
    });

    const cumulativeTransfers = allTransfers.filter((transfer: any) => {
      const blockNum = parseInt(transfer.node.blockNumber);
      return blockNum <= toBlock;
    });

    const gasUsed = cumulativeTransactions.reduce((sum: number, tx: any) => 
      sum + (parseInt(tx.node.gasUsed) || 0), 0
    );

    console.log(`合约 ${hash} 截止到区块 ${toBlock} 的累积数据: 交易 ${cumulativeTransactions.length}, 转账 ${cumulativeTransfers.length}, Gas ${gasUsed}`);

    return {
      gasUsed,
      transactionsCount: cumulativeTransactions.length,
      tokenTransfersCount: cumulativeTransfers.length
    };
  } catch (e) {
    console.error(`获取合约 ${hash} 统计失败:`, e);
    
    // 如果 GraphQL 失败，尝试使用简单查询
    try {
      const simpleQuery = {
        query: `{ address(hash: "${hash}") { hash gasUsed transactionsCount tokenTransfersCount } }`
      };
      
      const { data } = await axios.post(BLOCKSCOUT_GRAPHQL, simpleQuery, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      });
      
      if ((data as any) && (data as any).data && (data as any).data.address) {
        // 如果只能获取总数据，就返回全部数据（因为我们要的是累积数据）
        const totalStats = (data as any).data.address;
        
        return {
          gasUsed: totalStats.gasUsed || 0,
          transactionsCount: totalStats.transactionsCount || 0,
          tokenTransfersCount: totalStats.tokenTransfersCount || 0
        };
      }
    } catch (fallbackError) {
      console.error('备用查询也失败:', fallbackError);
    }
    
    return {
      gasUsed: 0,
      transactionsCount: 0,
      tokenTransfersCount: 0
    };
  }
}

// 获取项目截止到指定区块的累积统计数据
async function getProjectCumulativeStats(project: Project, toBlock: number) {
  const addresses = project.contract_address;
  let totalGasUsed = 0;
  let totalTransactionsCount = 0;
  let totalTokenTransfersCount = 0;

  const promises = Object.entries(addresses).map(async ([name, hash]) => {
    return await getContractCumulativeStats(hash, toBlock);
  });

  const results = await Promise.all(promises);
  results.forEach(result => {
    totalGasUsed += result.gasUsed;
    totalTransactionsCount += result.transactionsCount;
    totalTokenTransfersCount += result.tokenTransfersCount;
  });

  return {
    name: project.name,
    logo: project.logo,
    description: project.description,
    contractCount: Object.keys(addresses).length,
    totalGasUsed,
    totalTransactionsCount,
    totalTokenTransfersCount
  };
}

// 创建日变化统计卡片
function createDailyChangeCard(yesterdayEndStats: any[], dayBeforeEndStats: any[], date: string) {
  const elements = [
    {
      tag: "div",
      text: {
        tag: "plain_text",
        content: `📊 HashKey Chain 昨日净增长数据\n📅 日期: ${date}\n🕐 更新时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`
      }
    },
    {
      tag: "hr"
    }
  ];

  let hasChanges = false;

  yesterdayEndStats.forEach((yesterdayEnd, index) => {
    const dayBeforeEnd = dayBeforeEndStats.find(p => p.name === yesterdayEnd.name);
    if (!dayBeforeEnd) return;

    // 计算昨天的净增长（昨天结束时累积数据 - 前天结束时累积数据）
    const gasGrowth = yesterdayEnd.totalGasUsed - dayBeforeEnd.totalGasUsed;
    const txGrowth = yesterdayEnd.totalTransactionsCount - dayBeforeEnd.totalTransactionsCount;
    const transferGrowth = yesterdayEnd.totalTokenTransfersCount - dayBeforeEnd.totalTokenTransfersCount;

    // 只有有增长的项目才显示（理论上不应该有负增长）
    if (gasGrowth > 0 || txGrowth > 0 || transferGrowth > 0) {
      hasChanges = true;
      
      const gasGrowthText = gasGrowth > 0 ? `📈 +${formatNumber(gasGrowth)}` : '➖ 0';
      const txGrowthText = txGrowth > 0 ? `📈 +${formatNumber(txGrowth)}` : '➖ 0';
      const transferGrowthText = transferGrowth > 0 ? `📈 +${formatNumber(transferGrowth)}` : '➖ 0';

      elements.push({
        tag: "div",
        text: {
          tag: "plain_text",
          content: `🔥 ${yesterdayEnd.name}\n💰 Gas净增长: ${gasGrowthText}\n📈 交易净增长: ${txGrowthText}\n🔄 转账净增长: ${transferGrowthText}\n\n昨日结束时累积数据:\n• Gas: ${formatNumber(yesterdayEnd.totalGasUsed)}\n• 交易: ${formatNumber(yesterdayEnd.totalTransactionsCount)}\n• 转账: ${formatNumber(yesterdayEnd.totalTokenTransfersCount)}`
        }
      });

      if (index < yesterdayEndStats.length - 1) {
        elements.push({ tag: "hr" });
      }
    }
  });

  return {
    hasChanges,
    card: {
      msg_type: "interactive",
      card: {
        elements: elements,
        header: {
          title: {
            tag: "plain_text",
            content: "📈 HashKey Chain 日报"
          },
          template: "green"
        }
      }
    }
  };
}

// POST /api/lark/send-daily-stats
export async function POST(req: NextRequest) {
  try {
    const { chat_id, user_id } = await req.json();
    
    if (!chat_id && !user_id) {
      return NextResponse.json({ error: 'chat_id 或 user_id 必须提供其中一个' }, { status: 400 });
    }

    // 计算时间点（使用中国时区 UTC+8）
    const now = new Date();
    
    // 获取中国时区的当前时间
    const chinaTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    
    // 计算中国时区的今天0点
    const today0AM = new Date(chinaTime.getFullYear(), chinaTime.getMonth(), chinaTime.getDate(), 0, 0, 0);
    // 转换回 UTC 时间
    const today0AM_UTC = new Date(today0AM.getTime() - 8 * 60 * 60 * 1000);
    
    const yesterday0AM_UTC = new Date(today0AM_UTC.getTime() - 24 * 60 * 60 * 1000);
    const dayBefore0AM_UTC = new Date(yesterday0AM_UTC.getTime() - 24 * 60 * 60 * 1000);

    console.log('时间范围:', {
      现在: now.toISOString(),
      中国时间: chinaTime.toISOString(),
      前天0点UTC: dayBefore0AM_UTC.toISOString(),
      昨天0点UTC: yesterday0AM_UTC.toISOString(),
      今天0点UTC: today0AM_UTC.toISOString()
    });

    // 获取对应的区块号
    const [dayBeforeBlock, yesterdayBlock, todayBlock] = await Promise.all([
      getBlockByTimestamp(dayBefore0AM_UTC.getTime()),
      getBlockByTimestamp(yesterday0AM_UTC.getTime()),
      getBlockByTimestamp(today0AM_UTC.getTime())
    ]);

    console.log('区块号范围:', {
      dayBeforeBlock,
      yesterdayBlock,
      todayBlock
    });

    // 获取项目数据
    const projects = getProjects();
    
    // 获取昨天结束时的累积数据（截止到今天0点）
    const yesterdayEndStatsPromises = projects.map(project => 
      getProjectCumulativeStats(project, todayBlock)
    );
    
    // 获取前天结束时的累积数据（截止到昨天0点）
    const dayBeforeEndStatsPromises = projects.map(project => 
      getProjectCumulativeStats(project, yesterdayBlock)
    );

    console.log('数据查询范围:', {
      前天结束累积数据: `截止到区块 ${yesterdayBlock}`,
      昨天结束累积数据: `截止到区块 ${todayBlock}`,
      昨天净增长: `区块 ${yesterdayBlock} 到 ${todayBlock} 的差值`
    });

    const [yesterdayEndStats, dayBeforeEndStats] = await Promise.all([
      Promise.all(yesterdayEndStatsPromises),
      Promise.all(dayBeforeEndStatsPromises)
    ]);

    // 创建变化报告（现在比较的是累积总数的差值，即昨天的净增长）
    const dateStr = yesterday0AM_UTC.toLocaleDateString('zh-CN');
    const { hasChanges, card } = createDailyChangeCard(yesterdayEndStats, dayBeforeEndStats, dateStr);

    if (!hasChanges) {
      return NextResponse.json({
        success: true,
        message: '昨日无数据变化，未发送消息',
        hasChanges: false
      });
    }

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
      message: '日报已发送',
      hasChanges: true,
      lark_response: response,
      stats: {
        yesterdayEndStats,
        dayBeforeEndStats,
        blocks: { dayBeforeBlock, yesterdayBlock, todayBlock }
      }
    });

  } catch (error) {
    console.error('发送日报失败:', error);
    return NextResponse.json({
      error: '发送日报失败',
      details: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 });
  }
} 