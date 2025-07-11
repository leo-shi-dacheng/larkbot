#!/usr/bin/env node

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

// 模拟飞书消息事件
const mockLarkEvent = {
  "header": {
    "event_id": "test-event-123",
    "event_type": "im.message.receive_v1",
    "create_time": "1234567890",
    "token": "test-token",
    "app_id": "cli_a8d859d61f79d029",
    "tenant_key": "test-tenant"
  },
  "event": {
    "sender": {
      "sender_id": {
        "user_id": "test-user-123",
        "open_id": "test-open-123",
        "union_id": "test-union-123"
      },
      "sender_type": "user",
      "tenant_key": "test-tenant"
    },
    "message": {
      "message_id": "test-msg-123",
      "message_type": "text",
      "content": "{\"text\":\"Hello Bot\"}"
    },
    "chat_id": "test-chat-123",
    "chat_type": "p2p"
  }
};

async function testWebhook() {
  console.log('🚀 开始测试webhook...\n');

  try {
    // 1. 测试webhook接收事件
    console.log('1. 测试webhook接收消息事件...');
    const webhookResponse = await axios.post(`${BASE_URL}/api/lark/webhook`, mockLarkEvent, {
      headers: { 'Content-Type': 'application/json' }
    });
    console.log('✅ Webhook响应:', webhookResponse.data);
    console.log('');

    // 2. 查看捕获的用户信息
    console.log('2. 查看捕获的用户信息...');
    const usersResponse = await axios.get(`${BASE_URL}/api/lark/webhook`);
    console.log('✅ 用户信息:', JSON.stringify(usersResponse.data, null, 2));
    console.log('');

    // 3. 如果有用户信息，测试发送日报
    if (usersResponse.data.users && usersResponse.data.users.length > 0) {
      const testUserId = usersResponse.data.users[0].user_id;
      console.log(`3. 测试发送日报给用户: ${testUserId}...`);
      
      try {
        const dailyStatsResponse = await axios.post(`${BASE_URL}/api/lark/send-daily-stats`, {
          user_id: testUserId
        }, {
          headers: { 'Content-Type': 'application/json' }
        });
        console.log('✅ 日报发送响应:', dailyStatsResponse.data);
      } catch (dailyError) {
        console.log('⚠️ 日报发送失败（这是正常的，因为这是测试用户）:', dailyError.response?.data || dailyError.message);
      }
    }

    console.log('\n🎉 测试完成！');
    console.log('\n📝 接下来的步骤：');
    console.log('1. 启动开发服务器: npm run dev');
    console.log('2. 使用ngrok暴露服务: ngrok http 3000');
    console.log('3. 在飞书开发者后台配置webhook地址');
    console.log('4. 在飞书中向机器人发送消息');
    console.log('5. 访问 http://localhost:3000/api/lark/webhook 查看您的真实user_id');

  } catch (error) {
    console.error('❌ 测试失败:', error.response?.data || error.message);
    console.log('\n💡 提示：');
    console.log('- 确保开发服务器正在运行 (npm run dev)');
    console.log('- 检查端口3000是否被占用');
  }
}

async function checkServer() {
  try {
    console.log('🔍 检查服务器状态...');
    await axios.get(`${BASE_URL}/api/lark/webhook`);
    console.log('✅ 服务器正在运行\n');
    return true;
  } catch (error) {
    console.log('❌ 服务器未运行，请先启动: npm run dev\n');
    return false;
  }
}

// 主函数
async function main() {
  console.log('🤖 飞书Webhook测试工具\n');
  
  const serverRunning = await checkServer();
  if (serverRunning) {
    await testWebhook();
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testWebhook, checkServer }; 