import { RootAgent } from '../src/core/RootAgent';
import { ITask, AgentType } from '../src/types';
import { v4 as uuidv4 } from 'uuid';
import { setLLMService, LLMService } from '../src/services/llm';

/**
 * 完整流程演示
 * 用户输入任务 → 根Agent拆解 → 子Agent执行 → 返回结果
 */
async function main() {
  console.log('🚀 AI Agent 树形集群管理系统 - 演示\n');

  // 从环境变量获取 API Key
  const apiKey = process.env.KIMI_API_KEY;
  if (!apiKey) {
    console.error('❌ 错误: 请设置 KIMI_API_KEY 环境变量');
    console.log('\n示例:');
    console.log('  export KIMI_API_KEY=your_api_key_here');
    console.log('  npx ts-node examples/demo.ts');
    process.exit(1);
  }

  // 初始化 LLM 服务（标准 Kimi API）
  console.log('📡 初始化 LLM 服务...');
  const llmService = new LLMService(apiKey, 'kimi-k2-5', 'https://api.moonshot.cn/v1');
  setLLMService(llmService);
  console.log('✅ LLM 服务初始化完成\n');

  // 创建根Agent
  console.log('🤖 创建 RootAgent...');
  const rootAgent = new RootAgent({
    name: 'root-agent',
    type: AgentType.ROOT,
    description: '根Agent - 负责任务拆解和协调',
    maxRetries: 3,
    timeout: 120000,
    enableMonitor: true
  });

  await rootAgent.initialize();
  console.log(`✅ RootAgent 创建完成 (ID: ${rootAgent.id})\n`);

  // 创建用户任务
  const userTask: ITask = {
    id: uuidv4(),
    description: '设计一个Python脚本，用于分析CSV文件中的销售数据，生成包含总销售额、平均订单价值和最畅销产品的报告',
    context: {
      userRequest: true,
      priority: 'high'
    },
    createdAt: new Date()
  };

  console.log('📝 用户任务:');
  console.log(`   ${userTask.description}\n`);

  // 执行任务
  console.log('⏳ 开始执行任务...\n');
  console.log('─'.repeat(60));

  const startTime = Date.now();

  try {
    const result = await rootAgent.executeTask(userTask);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('─'.repeat(60));
    console.log(`\n✅ 任务执行完成! (耗时: ${duration}s)\n`);

    console.log('📊 执行结果:');
    console.log(`   任务ID: ${result.taskId}`);
    console.log(`   成功: ${result.success ? '✓' : '✗'}`);
    console.log(`   自测通过: ${result.selfTestPassed ? '✓' : '✗'}`);

    if (result.output) {
      console.log('\n📄 详细输出:');
      console.log(JSON.stringify(result.output, null, 2));
    }

    if (result.error) {
      console.log(`\n❌ 错误: ${result.error}`);
    }

  } catch (error) {
    console.error('\n❌ 任务执行失败:', error);
  }

  // 清理
  console.log('\n🧹 清理资源...');
  await rootAgent.terminate('Demo completed');
  console.log('✅ 演示结束');
}

// 运行演示
main().catch(console.error);
