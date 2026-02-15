/**
 * 简单测试 - 验证 LLM 服务集成
 * 使用模拟模式，无需真实 API Key
 */
import { LLMService } from '../src/services/llm';
import { setLLMService } from '../src/services/llm';
import { RootAgent } from '../src/core/RootAgent';
import { ChildAgent } from '../src/core/ChildAgent';
import { ITask, AgentType } from '../src/types';
import { v4 as uuidv4 } from 'uuid';

// 模拟 LLM 服务（用于测试）
class MockLLMService extends LLMService {
  constructor() {
    super('mock-key');
  }

  async decomposeTask(taskDescription: string) {
    console.log('🤖 [Mock LLM] 拆解任务:', taskDescription.substring(0, 50) + '...');
    return [
      { id: 'task-1', description: '分析需求', priority: 1, dependencies: [] },
      { id: 'task-2', description: '设计方案', priority: 2, dependencies: ['task-1'] },
      { id: 'task-3', description: '实现功能', priority: 3, dependencies: ['task-2'] }
    ];
  }

  async executeTask(taskDescription: string) {
    console.log('🤖 [Mock LLM] 执行任务:', taskDescription.substring(0, 50) + '...');
    return {
      success: true,
      output: `已完成: ${taskDescription}`,
      reasoning: '模拟执行逻辑'
    };
  }

  async selfTest(taskDescription: string, executionResult: string) {
    console.log('🤖 [Mock LLM] 自测验证');
    return {
      passed: true,
      feedback: '模拟验证通过'
    };
  }
}

async function main() {
  console.log('🧪 测试 AI Agent 树形集群管理系统\n');

  // 使用模拟 LLM 服务
  const mockLLM = new MockLLMService();
  setLLMService(mockLLM);

  // 测试 1: LLM 服务
  console.log('─'.repeat(50));
  console.log('测试 1: LLM 服务');
  console.log('─'.repeat(50));

  const subTasks = await mockLLM.decomposeTask('设计一个数据分析系统');
  console.log('✅ 任务拆解结果:', subTasks.length, '个子任务');
  subTasks.forEach((task, i) => {
    console.log(`   ${i + 1}. ${task.description}`);
  });

  const execResult = await mockLLM.executeTask('实现数据清洗模块');
  console.log('\n✅ 任务执行结果:', execResult.success ? '成功' : '失败');

  const testResult = await mockLLM.selfTest('实现数据清洗模块', execResult.output);
  console.log('✅ 自测结果:', testResult.passed ? '通过' : '失败');

  // 测试 2: RootAgent
  console.log('\n' + '─'.repeat(50));
  console.log('测试 2: RootAgent');
  console.log('─'.repeat(50));

  const rootAgent = new RootAgent({
    name: 'test-root',
    description: '测试根Agent',
    type: AgentType.ROOT
  });
  await rootAgent.initialize();
  console.log('✅ RootAgent 初始化完成 (ID:', rootAgent.id + ')');

  const testTask: ITask = {
    id: uuidv4(),
    description: '开发一个用户认证系统',
    createdAt: new Date()
  };

  const decomposed = await rootAgent.decomposeTask(testTask);
  console.log('✅ 任务拆解完成:', decomposed.length, '个子任务');

  // 测试 3: ChildAgent
  console.log('\n' + '─'.repeat(50));
  console.log('测试 3: ChildAgent');
  console.log('─'.repeat(50));

  const childAgent = new ChildAgent({
    name: 'test-child',
    description: '测试子Agent',
    type: AgentType.CHILD,
    parentId: rootAgent.id
  });
  await childAgent.initialize();
  console.log('✅ ChildAgent 初始化完成 (ID:', childAgent.id + ')');

  const subTask: ITask = {
    id: uuidv4(),
    description: '实现登录功能',
    parentTaskId: testTask.id,
    createdAt: new Date()
  };

  const result = await childAgent.executeTask(subTask);
  console.log('✅ 子任务执行完成:', result.success ? '成功' : '失败');
  console.log('✅ 自测状态:', result.selfTestPassed ? '通过' : '失败');

  // 测试 4: 完整流程
  console.log('\n' + '─'.repeat(50));
  console.log('测试 4: 完整流程');
  console.log('─'.repeat(50));

  const userTask: ITask = {
    id: uuidv4(),
    description: '创建一个简单的待办事项应用',
    createdAt: new Date()
  };

  console.log('用户任务:', userTask.description);
  const finalResult = await rootAgent.executeTask(userTask);

  console.log('\n✅ 完整流程执行完成!');
  console.log('   成功:', finalResult.success ? '✓' : '✗');
  console.log('   自测通过:', finalResult.selfTestPassed ? '✓' : '✗');

  if (finalResult.output) {
    console.log('   子任务数量:', finalResult.output.subTaskCount || 'N/A');
    console.log('   成功子任务:', finalResult.output.successCount || 'N/A');
  }

  // 清理
  await rootAgent.terminate('Test completed');

  console.log('\n' + '═'.repeat(50));
  console.log('🎉 所有测试通过!');
  console.log('═'.repeat(50));
}

main().catch(error => {
  console.error('❌ 测试失败:', error);
  process.exit(1);
});
