import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@larksuiteoapi/node-sdk';

// Lark 配置
const LARK_APP_ID = 'cli_a8d859d61f79d029';
const LARK_APP_SECRET = 'tKH9XTd7AQreOJEKnhw40gf7TiOshD0b';

const client = new Client({
  appId: LARK_APP_ID,
  appSecret: LARK_APP_SECRET,
});

// GET /api/lark/get-user-info
export async function GET(req: NextRequest) {
  try {
    // 获取access_token
    const tokenResponse = await client.auth.tenantAccessToken.internal({
      data: {
        app_id: LARK_APP_ID,
        app_secret: LARK_APP_SECRET
      }
    });

    const accessToken = (tokenResponse as any).tenant_access_token;
    if (!accessToken) {
      return NextResponse.json({ error: '获取访问令牌失败' }, { status: 500 });
    }

    // 获取应用信息
    const appInfoResponse = await client.application.application.get({
      params: {
        lang: 'zh_cn' as const
      },
      path: {
        app_id: LARK_APP_ID
      }
    });

    const appInfo = (appInfoResponse as any).data?.app;

    // 获取用户列表（需要相应权限）
    try {
      const userListResponse = await client.contact.user.list({
        params: {
          page_size: 10
        }
      });

      const users = (userListResponse as any).data?.items || [];

      return NextResponse.json({
        success: true,
        app_info: {
          app_id: LARK_APP_ID,
          app_name: appInfo?.app_name,
          description: appInfo?.description
        },
        access_token: accessToken,
        users: users,
        message: '要获取您的user_id，请查看users数组中的信息，或者在飞书中发送消息给机器人时，机器人会收到您的user_id'
      });
    } catch (userError) {
      return NextResponse.json({
        success: true,
        app_info: {
          app_id: LARK_APP_ID,
          app_name: appInfo?.app_name,
          description: appInfo?.description
        },
        access_token: accessToken,
        error: '无法获取用户列表，可能需要更多权限',
        message: '要获取您的user_id，请在飞书中发送消息给机器人，机器人会收到您的user_id'
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

// POST /api/lark/get-user-info - 通过用户提供的信息获取user_id
export async function POST(req: NextRequest) {
  try {
    const { email, mobile, name } = await req.json();

    if (!email && !mobile && !name) {
      return NextResponse.json({ 
        error: '请提供邮箱、手机号或姓名中的至少一个信息',
        example: {
          email: 'user@example.com',
          mobile: '+8613800000000',
          name: '张三'
        }
      }, { status: 400 });
    }

    // 通过邮箱查找用户
    if (email) {
      try {
        const userResponse = await client.contact.user.batchGetId({
          data: {
            emails: [email]
          }
        });

        const userList = (userResponse as any).data?.user_list;
        if (userList && userList.length > 0) {
          return NextResponse.json({
            success: true,
            user_id: userList[0].user_id,
            method: 'email',
            user_info: userList[0]
          });
        }
      } catch (e) {
        console.error('通过邮箱查找用户失败:', e);
      }
    }

    // 通过手机号查找用户
    if (mobile) {
      try {
        const userResponse = await client.contact.user.batchGetId({
          data: {
            mobiles: [mobile]
          }
        });

        const userList = (userResponse as any).data?.user_list;
        if (userList && userList.length > 0) {
          return NextResponse.json({
            success: true,
            user_id: userList[0].user_id,
            method: 'mobile',
            user_info: userList[0]
          });
        }
      } catch (e) {
        console.error('通过手机号查找用户失败:', e);
      }
    }

    return NextResponse.json({
      error: '未找到匹配的用户',
      message: '请确认提供的信息是否正确，或者尝试在飞书中直接与机器人对话获取user_id'
    }, { status: 404 });

  } catch (error) {
    console.error('查找用户失败:', error);
    return NextResponse.json({
      error: '查找用户失败',
      details: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 });
  }
} 