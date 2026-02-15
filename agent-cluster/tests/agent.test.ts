import { Agent, RootAgent, ChildAgent, Storage } from '../src/core';
import { AgentType, AgentStatus, ITask, IAgentConfig, IAgentState } from '../src/types';

describe('Agent Cluster', () => {
  let storage: Storage;

  beforeAll(async () => {
    storage = Storage.getInstance();
    await storage.initialize();
  });

  describe('Agent Base Class', () => {
    it('should create an agent with correct properties', () => {
      const config: IAgentConfig = {
        name: 'test-agent',
        type: AgentType.CHILD
      };
      
      const agent = new ChildAgent(config);
      
      expect(agent.name).toBe('test-agent');
      expect(agent.type).toBe(AgentType.CHILD);
      expect(agent.status).toBe(AgentStatus.IDLE);
      expect(agent.children.size).toBe(0);
    });

    it('should manage child agents in tree structure', async () => {
      const rootConfig: IAgentConfig = {
        name: 'root-agent',
        type: AgentType.ROOT
      };
      
      const root = new RootAgent(rootConfig);
      await root.initialize();
      
      const childConfig: IAgentConfig = {
        name: 'child-agent',
        type: AgentType.CHILD
      };
      
      const child = root.addChild(childConfig);
      
      expect(root.children.size).toBe(1);
      expect(child.parentId).toBe(root.id);
      
      const foundChild = root.getChild(child.id);
      expect(foundChild).toBeDefined();
      
      root.removeChild(child.id);
      expect(root.children.size).toBe(0);
      
      await root.terminate();
    });
  });

  describe('RootAgent', () => {
    it('should decompose task into subtasks', () => {
      const root = new RootAgent({
        name: 'root',
        type: AgentType.ROOT
      });
      
      const task: ITask = {
        id: 'task-1',
        description: '分析并实现一个用户认证系统',
        createdAt: new Date()
      };
      
      const subTasks = root.decomposeTask(task);
      
      expect(subTasks.length).toBeGreaterThan(0);
      expect(subTasks[0].parentTaskId).toBe(task.id);
    });

    it('should aggregate subtask results', async () => {
      const root = new RootAgent({
        name: 'root',
        type: AgentType.ROOT
      });
      
      const results = [
        {
          taskId: 'sub-1',
          success: true,
          output: 'Result 1',
          completedAt: new Date(),
          selfTestPassed: true
        },
        {
          taskId: 'sub-2',
          success: true,
          output: 'Result 2',
          completedAt: new Date(),
          selfTestPassed: true
        }
      ];
      
      const aggregated = root.aggregateResults(results);
      
      expect(aggregated.success).toBe(true);
      expect(aggregated.selfTestPassed).toBe(true);
      expect(aggregated.output.subTaskCount).toBe(2);
    });
  });

  describe('ChildAgent', () => {
    it('should validate task context', async () => {
      const child = new ChildAgent({
        name: 'child',
        type: AgentType.CHILD
      });
      
      await child.initialize();
      
      const validTask: ITask = {
        id: 'task-1',
        description: '测试任务',
        context: {
          instruction: '执行测试'
        },
        createdAt: new Date()
      };
      
      // 任务会被执行，但因为没有实际执行逻辑，会返回失败
      const result = await child.executeTask(validTask);
      expect(result.taskId).toBe('task-1');
      
      await child.terminate();
    });

    it('should perform self-test', async () => {
      const child = new ChildAgent({
        name: 'child',
        type: AgentType.CHILD
      });
      
      await child.initialize();
      
      // 没有当前任务时自测应该失败
      const testResult = await child.selfTest();
      expect(testResult).toBe(false);
      
      await child.terminate();
    });
  });

  describe('Error Loop Detection', () => {
    it('should detect error loop', () => {
      const agent = new ChildAgent({
        name: 'child',
        type: AgentType.CHILD
      });
      
      // 记录相同错误3次
      agent['recordError']('Same error');
      agent['recordError']('Same error');
      agent['recordError']('Same error');
      
      expect(agent.isInErrorLoop(3)).toBe(true);
    });

    it('should not detect loop for different errors', () => {
      const agent = new ChildAgent({
        name: 'child',
        type: AgentType.CHILD
      });
      
      agent['recordError']('Error 1');
      agent['recordError']('Error 2');
      agent['recordError']('Error 3');
      
      expect(agent.isInErrorLoop(3)).toBe(false);
    });
  });

  describe('Storage', () => {
    it('should save and load agent state', async () => {
      const state: IAgentState = {
        id: 'test-agent',
        name: 'Test',
        type: AgentType.CHILD,
        description: 'Test agent for storage',
        context: {
          conversationHistory: [],
          taskState: { taskHistory: [], completedTasks: [] },
          executionLog: []
        },
        template: 'ChildAgent',
        childrenIds: [],
        status: AgentStatus.IDLE,
        createdAt: new Date(),
        updatedAt: new Date(),
        errorCount: 0,
        errorHistory: [],
        config: { name: 'Test', type: AgentType.CHILD }
      };
      
      await storage.saveAgentState('test-agent', state);
      const loaded = await storage.loadAgentState('test-agent');
      
      expect(loaded?.id).toEqual(state.id);
      expect(loaded?.name).toEqual(state.name);
      expect(loaded?.status).toEqual(state.status);
      
      await storage.deleteAgentState('test-agent');
    });

    it('should return null for non-existent state', async () => {
      const loaded = await storage.loadAgentState('non-existent');
      expect(loaded).toBeNull();
    });
  });
});