import { NextRequest, NextResponse } from 'next/server';
import { getBridgeLiquidity } from '@utils/bridgeLiquidity';

export async function GET(req: NextRequest) {
  try {
    const results = await getBridgeLiquidity();
    return NextResponse.json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error('监控流动性失败:', error);
    return NextResponse.json({
      error: '监控流动性失败',
      details: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 });
  }
}