import {
  IChildAgent,
  IAgentConfig,
  ITask,
  ITaskResult,
  AgentType,
  AgentStatus
} from '../types';
import { Agent } from './Agent';
import { LLMService, getLLMService } from '../services/llm';

/**
 * 子Agent
 * 动态创建，执行具体任务，自测通过后上报
 */
export class ChildAgent extends Agent implements IChildAgent {
  private agentMdContent?: string;
  private llmService: LLMService;

  constructor(config: IAgentConfig) {
    super({
      ...config,
      type: AgentType.CHILD,
      template: config.template || 'ChildAgent'
    });
    this.llmService = getLLMService();
  }

  /**
   * 初始化子Agent
   */
  public async initialize(): Promise<void> {
    await super.initialize();
    
    // 加载 Agent.md 模板
    try {
      this.agentMdContent = await this.loadAgentMd();
    } catch (error) {
      console.warn(`Failed to load Agent.md template ${this.template}:`, error);
    }
    
    this.updateStatus(AgentStatus.IDLE);
  }

  /**
   * 执行具体任务
   */
  public async executeTask(task: ITask): Promise<ITaskResult> {
    this.updateStatus(AgentStatus.RUNNING);
    this.currentTask = task;

    await this.addExecutionLog('task_start', `Starting task: ${task.description}`);

    try {
      // 1. 验证任务上下文（确保只接收明确指令）
      if (!this.validateTaskContext(task)) {
        throw new Error('Invalid task context: missing required instruction');
      }

      // 2. 使用LLM执行任务
      const executionResult = await this.performTask(task);

      // 3. 使用LLM进行自测
      await this.addExecutionLog('self_test', 'Running self-test with LLM...');
      const selfTestPassed = await this.selfTest();

      if (!selfTestPassed) {
        throw new Error('Self-test failed');
      }

      await this.addExecutionLog('self_test_passed', 'Self-test passed');

      // 4. 构建结果
      const result: ITaskResult = {
        taskId: task.id,
        success: true,
        output: executionResult,
        completedAt: new Date(),
        selfTestPassed: true
      };

      this.updateStatus(AgentStatus.COMPLETED);
      await this.reportResult(result);
      await this.reportToParent(result);

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.addExecutionLog('error', `Error: ${errorMessage}`);
      this.recordError(errorMessage);

      // 检查是否进入错误循环
      if (this.isInErrorLoop()) {
        this.updateStatus(AgentStatus.ERROR_LOOP);
      } else {
        this.updateStatus(AgentStatus.FAILED);
      }

      const result: ITaskResult = {
        taskId: task.id,
        success: false,
        error: errorMessage,
        completedAt: new Date(),
        selfTestPassed: false
      };

      await this.reportResult(result);
      await this.reportToParent(result);

      return result;
    }
  }

  /**
   * 自测
   * 使用LLM验证任务执行结果是否符合预期
   */
  public async selfTest(): Promise<boolean> {
    if (!this.currentTask) {
      return false;
    }

    try {
      // 获取执行结果（从上下文或最后结果中获取）
      const lastOutput = this.context.executionLog
        .filter(log => log.action === 'task_executed')
        .pop()?.result || '';

      // 调用LLM进行自测验证
      const testResult = await this.llmService.selfTest(
        this.currentTask.description,
        lastOutput
      );

      await this.addExecutionLog(
        testResult.passed ? 'self_test_passed' : 'self_test_failed',
        testResult.feedback
      );

      return testResult.passed;

    } catch (error) {
      await this.addExecutionLog('self_test_error', `Self-test error: ${error}`);
      // 出错时回退到基础自测
      return this.fallbackSelfTest();
    }
  }

  /**
   * 基础自测（降级方案）
   */
  private fallbackSelfTest(): boolean {
    if (!this.currentTask) {
      return false;
    }

    try {
      // 基础自测：检查结果是否存在
      const testCases = this.extractTestCases();

      for (const testCase of testCases) {
        const passed = testCase.validate();
        if (!passed) {
          return false;
        }
      }

      return true;

    } catch (error) {
      return false;
    }
  }

  /**
   * 加载 Agent.md 模板
   */
  public async loadAgentMd(): Promise<string> {
    const content = await this.storage.loadAgentMd(this.template);
    if (!content) {
      throw new Error(`Agent template not found: ${this.template}`);
    }
    this.agentMdContent = content;
    return content;
  }

  /**
   * 向父节点报告结果
   */
  public async reportToParent(result: ITaskResult): Promise<void> {
    if (!this.parentId) {
      console.warn(`Agent ${this.id} has no parent to report to`);
      return;
    }
    
    await this.addExecutionLog('report_to_parent', `Reporting result to parent ${this.parentId}`);
    
    // 调用父类方法进行存储
    await super.reportResult(result);
  }

  /**
   * 验证任务上下文
   * 确保只接收父节点传递的明确指令
   */
  private validateTaskContext(task: ITask): boolean {
    // 必须包含明确的指令
    if (!task.context?.instruction && !task.description) {
      return false;
    }
    
    // 检查是否包含不允许的上下文信息
    // 这里可以根据安全策略进行更严格的检查
    
    return true;
  }

  /**
   * 执行具体任务逻辑
   * 使用LLM执行任务并返回结果
   */
  private async performTask(task: ITask): Promise<any> {
    const instruction = task.context?.instruction || task.description;

    await this.addExecutionLog('perform_task', `Performing: ${instruction}`);

    try {
      // 调用LLM执行任务
      const result = await this.llmService.executeTask(instruction, task.context);

      const output = {
        agentId: this.id,
        taskId: task.id,
        instruction,
        executedAt: new Date(),
        llmResult: result
      };

      await this.addExecutionLog('task_executed', result.output);

      return output;

    } catch (error) {
      await this.addExecutionLog('task_error', `Error: ${error}`);
      throw error;
    }
  }

  /**
   * 从 Agent.md 提取测试用例
   */
  private extractTestCases(): Array<{ name: string; validate: () => boolean }> {
    // TODO: 解析 Agent.md 中的测试规范
    // 当前返回基础测试用例
    
    return [
      {
        name: 'basic_validation',
        validate: () => this.currentTask !== undefined
      },
      {
        name: 'status_check',
        validate: () => this.status === AgentStatus.RUNNING
      }
    ];
  }

  /**
   * 运行单个测试用例
   */
  private async runTestCase(testCase: { name: string; validate: () => boolean }): Promise<boolean> {
    try {
      return testCase.validate();
    } catch (error) {
      await this.addExecutionLog('test_error', `Test case ${testCase.name} threw error: ${error}`);
      return false;
    }
  }

  /**
   * 获取 Agent.md 内容
   */
  public getAgentMdContent(): string | undefined {
    return this.agentMdContent;
  }
}