import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// 存储用户信息的简单内存存储（生产环境建议使用数据库）
const userStore = new Map<string, any>();

// 飞书应用配置
const LARK_APP_ID = 'cli_a8d859d61f79d029';
const LARK_ENCRYPT_KEY = ''; // 如果启用了加密，需要填入加密密钥
const LARK_VERIFICATION_TOKEN = ''; // 验证token，在飞书开发者后台获取

// 验证请求来源（可选）
function verifySignature(timestamp: string, nonce: string, encryptKey: string, body: string): boolean {
  if (!LARK_VERIFICATION_TOKEN) return true; // 如果没有设置验证token，跳过验证
  
  const signature = crypto
    .createHmac('sha256', LARK_VERIFICATION_TOKEN)
    .update(timestamp + nonce + encryptKey + body)
    .digest('hex');
  
  return signature === encryptKey;
}

// POST /api/lark/webhook - 接收飞书事件
export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const event = JSON.parse(body);

    console.log('收到飞书事件:', JSON.stringify(event, null, 2));

    // URL验证（首次配置webhook时）
    if (event.type === 'url_verification') {
      return NextResponse.json({
        challenge: event.challenge
      });
    }

    // 处理消息事件
    if (event.header?.event_type === 'im.message.receive_v1') {
      const message = event.event;
      const sender = message.sender;
      
      // 记录用户信息
      const userInfo = {
        user_id: sender.sender_id?.user_id,
        open_id: sender.sender_id?.open_id,
        union_id: sender.sender_id?.union_id,
        sender_type: sender.sender_type,
        tenant_key: sender.tenant_key,
        message_type: message.message_type,
        message_content: message.message,
        chat_id: message.chat_id,
        chat_type: message.chat_type,
        timestamp: new Date().toISOString(),
        event_id: event.header.event_id
      };

      // 存储用户信息
      if (userInfo.user_id) {
        userStore.set(userInfo.user_id, userInfo);
        console.log(`记录用户信息: ${userInfo.user_id}`, userInfo);
      }

      return NextResponse.json({
        success: true,
        message: '事件已处理',
        captured_user_id: userInfo.user_id
      });
    }

    // 处理其他事件类型
    console.log('未处理的事件类型:', event.header?.event_type || event.type);
    
    return NextResponse.json({
      success: true,
      message: '事件已接收但未处理'
    });

  } catch (error) {
    console.error('处理webhook失败:', error);
    return NextResponse.json({
      error: '处理webhook失败',
      details: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 });
  }
}

// GET /api/lark/webhook - 查看捕获的用户信息
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get('user_id');

    if (userId) {
      // 获取特定用户信息
      const userInfo = userStore.get(userId);
      if (userInfo) {
        return NextResponse.json({
          success: true,
          user_info: userInfo
        });
      } else {
        return NextResponse.json({
          error: '未找到该用户信息',
          message: '请先在飞书中向机器人发送消息'
        }, { status: 404 });
      }
    } else {
      // 获取所有捕获的用户信息
      const allUsers = Array.from(userStore.values());
      return NextResponse.json({
        success: true,
        total_users: allUsers.length,
        users: allUsers,
        message: allUsers.length === 0 ? '暂无用户信息，请在飞书中向机器人发送消息' : '以下是捕获的用户信息'
      });
    }

  } catch (error) {
    console.error('获取用户信息失败:', error);
    return NextResponse.json({
      error: '获取用户信息失败',
      details: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 });
  }
} 