import { NextRequest, NextResponse } from 'next/server';

// GET /api/debug/check-time
export async function GET(req: NextRequest) {
  const now = new Date();
  
  // 方法1：直接使用 UTC 时间计算
  const todayUTC = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const yesterdayUTC = new Date(todayUTC.getTime() - 24 * 60 * 60 * 1000);
  const dayBeforeUTC = new Date(yesterdayUTC.getTime() - 24 * 60 * 60 * 1000);
  
  // 方法2：使用中国时区计算
  const chinaTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const todayChina = new Date(chinaTime.getFullYear(), chinaTime.getMonth(), chinaTime.getDate(), 0, 0, 0);
  const todayChina_UTC = new Date(todayChina.getTime() - 8 * 60 * 60 * 1000);
  const yesterdayChina_UTC = new Date(todayChina_UTC.getTime() - 24 * 60 * 60 * 1000);
  const dayBeforeChina_UTC = new Date(yesterdayChina_UTC.getTime() - 24 * 60 * 60 * 1000);

  // 方法3：使用本地时间
  const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayLocal = new Date(todayLocal.getTime() - 24 * 60 * 60 * 1000);
  const dayBeforeLocal = new Date(yesterdayLocal.getTime() - 24 * 60 * 60 * 1000);

  return NextResponse.json({
    现在时间: {
      UTC: now.toISOString(),
      本地: now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
      时间戳: now.getTime()
    },
    方法1_直接UTC: {
      前天: dayBeforeUTC.toISOString(),
      昨天: yesterdayUTC.toISOString(), 
      今天: todayUTC.toISOString()
    },
    方法2_中国时区转UTC: {
      前天: dayBeforeChina_UTC.toISOString(),
      昨天: yesterdayChina_UTC.toISOString(),
      今天: todayChina_UTC.toISOString()
    },
    方法3_本地时间: {
      前天: dayBeforeLocal.toISOString(),
      昨天: yesterdayLocal.toISOString(),
      今天: todayLocal.toISOString()
    },
    分析: {
      当前是中国时间几点: chinaTime.getHours(),
      是否已过今天0点: chinaTime.getHours() >= 0,
      昨天应该是哪一天: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    }
  });
} 