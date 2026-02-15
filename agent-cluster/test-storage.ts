import { Storage } from './src/core/Storage';
import { IAgentState, AgentStatus, AgentType, IAgentContext } from './src/types';
import * as fs from 'fs/promises';
import * as path from 'path';

async function testStorage() {
  console.log('🧪 Testing Storage Layer\n');
  
  // 使用临时目录
  const testPath = './test-data';
  const storage = Storage.getInstance();
  storage.setBasePath(testPath);
  
  // 初始化
  await storage.initialize();
  console.log('✅ Storage initialized');
  
  // 创建测试状态
  const testState: IAgentState = {
    id: 'root/child-a/grandchild-1',
    name: 'Test Agent',
    type: AgentType.CHILD,
    description: '这是一个测试Agent，用于验证存储层功能',
    template: 'ChildAgent',
    parentId: 'root/child-a',
    childrenIds: [],
    status: AgentStatus.IDLE,
    context: {
      conversationHistory: [
        { role: 'user', content: 'Hello', timestamp: new Date() },
        { role: 'assistant', content: 'Hi there!', timestamp: new Date() }
      ],
      taskState: {
        currentTaskId: 'task-1',
        taskHistory: ['task-1'],
        completedTasks: []
      },
      executionLog: [
        { action: 'init', result: 'success', timestamp: new Date() }
      ],
      customData: { testKey: 'testValue' }
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    errorCount: 0,
    errorHistory: [],
    config: {
      name: 'Test Agent',
      type: AgentType.CHILD,
      description: 'Test description',
      template: 'ChildAgent'
    }
  };
  
  // 测试保存状态
  await storage.saveAgentState(testState.id, testState);
  console.log('✅ Agent state saved');
  
  // 测试加载状态
  const loadedState = await storage.loadAgentState(testState.id);
  if (loadedState) {
    console.log('✅ Agent state loaded');
    console.log('  - ID:', loadedState.id);
    console.log('  - Description:', loadedState.description);
    console.log('  - Template:', loadedState.template);
    console.log('  - Parent ID:', loadedState.parentId);
    console.log('  - Children IDs:', loadedState.childrenIds);
    console.log('  - Status:', loadedState.status);
    console.log('  - Context entries:', loadedState.context.conversationHistory.length);
  }
  
  // 测试上下文独立存储
  await storage.saveContext(testState.id, testState.context);
  console.log('✅ Context saved separately');
  
  const loadedContext = await storage.loadContext(testState.id);
  if (loadedContext) {
    console.log('✅ Context loaded separately');
    console.log('  - Conversation entries:', loadedContext.conversationHistory.length);
    console.log('  - Execution log entries:', loadedContext.executionLog.length);
  }
  
  // 测试追加对话
  await storage.appendToConversation(testState.id, {
    role: 'user',
    content: 'New message',
    timestamp: new Date()
  });
  console.log('✅ Conversation entry appended');
  
  // 测试追加执行日志
  await storage.appendToExecutionLog(testState.id, {
    action: 'test_action',
    result: 'test_result',
    timestamp: new Date()
  });
  console.log('✅ Execution log entry appended');
  
  // 测试列出状态
  const states = await storage.listAgentStates();
  console.log('✅ Listed agent states:', states);
  
  // 测试 Agent.md 存储
  const templateContent = `# TestAgent.md

## 描述

description: 测试Agent模板

## 角色

这是一个测试模板。
`;
  await storage.saveAgentMd('TestAgent', templateContent);
  console.log('✅ Agent.md template saved');
  
  const loadedTemplate = await storage.loadAgentMd('TestAgent');
  if (loadedTemplate) {
    console.log('✅ Agent.md template loaded');
    console.log('  - Has description:', loadedTemplate.includes('description:'));
  }
  
  const templates = await storage.listAgentMds();
  console.log('✅ Listed templates:', templates);
  
  // 清理测试数据
  await storage.deleteAgentState(testState.id);
  await storage.deleteAgentMd('TestAgent');
  console.log('✅ Test data cleaned up');
  
  // 删除测试目录
  await fs.rm(testPath, { recursive: true, force: true });
  console.log('✅ Test directory removed');
  
  console.log('\n🎉 All storage tests passed!');
}

testStorage().catch(console.error);
