import { NextRequest, NextResponse } from 'next/server';
import { getBridgeLiquidity } from '@utils/bridgeLiquidity';

export async function GET(req: NextRequest) {
  try {
    const bridgeLiquidityData = await getBridgeLiquidity();
    const formattedResults: string[] = [];

    for (const data of bridgeLiquidityData) {
      if (data.error) {
        formattedResults.push(`${data.name} 流动性查询失败: ${data.error}`);
      } else {
        formattedResults.push(`${data.name} 流动性: ${data.balance} ${data.symbol}`);
      }
    }

    return NextResponse.json({
      success: true,
      data: formattedResults,
    });

  } catch (error) {
    console.error('监控流动性失败:', error);
    return NextResponse.json({
      error: '监控流动性失败',
      details: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 });
  }
}