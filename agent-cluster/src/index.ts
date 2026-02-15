import { RootAgent } from './core';
import { ITask } from './types';

/**
 * 示例入口文件
 * 演示如何使用 Agent Cluster 系统
 */
async function main() {
  console.log('🚀 Starting Agent Cluster Demo\n');

  // 创建根Agent
  const rootAgent = new RootAgent({
    name: 'root-agent',
    type: 'root' as any,
    maxRetries: 3,
    timeout: 300000,
    enableMonitor: true
  });

  // 初始化
  await rootAgent.initialize();
  console.log(`✅ Root Agent initialized: ${rootAgent.id}\n`);

  // 创建示例任务
  const task: ITask = {
    id: 'demo-task-1',
    description: '分析并实现一个用户认证系统',
    context: {
      priority: 'high',
      requirements: ['登录', '注册', '密码重置']
    },
    createdAt: new Date()
  };

  console.log(`📋 Task: ${task.description}\n`);

  try {
    // 执行任务
    const result = await rootAgent.executeTask(task);
    
    console.log('\n📊 Execution Result:');
    console.log(JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('❌ Execution failed:', error);
  } finally {
    // 清理
    await rootAgent.terminate('Demo completed');
    console.log('\n👋 Demo completed');
  }
}

// 如果直接运行此文件
if (require.main === module) {
  main().catch(console.error);
}

export { main };