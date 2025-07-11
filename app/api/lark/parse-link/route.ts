import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@larksuiteoapi/node-sdk';

// Lark 配置
const LARK_APP_ID = 'cli_a8d859d61f79d029';
const LARK_APP_SECRET = 'tKH9XTd7AQreOJEKnhw40gf7TiOshD0b';

const client = new Client({
  appId: LARK_APP_ID,
  appSecret: LARK_APP_SECRET,
});

// POST /api/lark/parse-link
export async function POST(req: NextRequest) {
  try {
    const { link_url, link_token } = await req.json();

    if (!link_url && !link_token) {
      return NextResponse.json({
        error: '请提供link_url或link_token',
        example: {
          link_url: 'https://applink.larksuite.com/client/chat/chatter/add_by_link?link_token=xxx',
          link_token: '766h7b4c-d07d-443d-8067-85826cm3d0sc'
        }
      }, { status: 400 });
    }

    // 从URL中提取link_token
    let token = link_token;
    if (link_url && !token) {
      const urlObj = new URL(link_url);
      token = urlObj.searchParams.get('link_token');
    }

    if (!token) {
      return NextResponse.json({
        error: '无法从链接中提取link_token'
      }, { status: 400 });
    }

    console.log('尝试解析link_token:', token);

    // 尝试通过API获取群聊信息（可能需要特殊权限）
    try {
      // 这个API可能不存在或需要特殊权限，先尝试
      const chatInfo = await client.im.chat.get({
        path: {
          chat_id: token // 尝试直接使用token作为chat_id
        }
      });

      return NextResponse.json({
        success: true,
        method: 'direct_api',
        chat_info: chatInfo,
        extracted_token: token
      });

    } catch (apiError) {
      console.log('直接API调用失败:', apiError);

      // 尝试其他方法
      return NextResponse.json({
        success: false,
        extracted_token: token,
        message: '无法直接解析link_token为chat_id',
        suggestions: [
          '1. 点击链接加入群聊',
          '2. 在群聊中点击群名称',
          '3. 复制群链接获取标准chat_id',
          '4. 或者在群里发消息给机器人，通过webhook捕获chat_id'
        ],
        alternative_methods: {
          webhook_capture: 'POST /api/lark/webhook（需要先配置）',
          manual_extract: '从群聊设置中手动获取',
          chat_list: 'GET /api/lark/get-chat-id（获取所有群聊）'
        },
        note: 'link_token通常不等于chat_id，需要转换'
      });
    }

  } catch (error) {
    console.error('解析链接失败:', error);
    return NextResponse.json({
      error: '解析链接失败',
      details: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 });
  }
}

// GET /api/lark/parse-link - 显示使用说明
export async function GET(req: NextRequest) {
  return NextResponse.json({
    usage: '解析飞书群聊邀请链接',
    method: 'POST',
    parameters: {
      link_url: 'https://applink.larksuite.com/client/chat/chatter/add_by_link?link_token=xxx',
      或者: 'link_token: xxx'
    },
    example: {
      link_url: 'https://applink.larksuite.com/client/chat/chatter/add_by_link?link_token=766h7b4c-d07d-443d-8067-85826cm3d0sc'
    },
    note: 'link_token通常需要转换才能得到标准的chat_id格式'
  });
} 