import { NextRequest, NextResponse } from 'next/server';
import { getContractBalances } from '@utils/contractBalances';

export async function GET(req: NextRequest) {
  try {
    const results = await getContractBalances();

    return NextResponse.json({
      success: true,
      data: results,
    });

  } catch (error) {
    console.error('查询合约余额失败:', error);
    return NextResponse.json({
      error: '查询合约余额失败',
      details: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 });
  }
}