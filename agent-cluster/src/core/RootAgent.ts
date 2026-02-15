import {
  IRootAgent,
  IAgent,
  IAgentConfig,
  ITask,
  ITaskResult,
  AgentType,
  AgentStatus
} from '../types';
import { Agent } from './Agent';
import { v4 as uuidv4 } from 'uuid';

/**
 * 根Agent
 * 用户入口，负责LLM动态拆解任务
 */
export class RootAgent extends Agent implements IRootAgent {
  private taskQueue: ITask[];
  private results: Map<string, ITaskResult>;

  constructor(config: IAgentConfig) {
    super({
      ...config,
      type: AgentType.ROOT,
      template: config.template || 'RootAgent'
    });
    
    this.taskQueue = [];
    this.results = new Map();
  }

  /**
   * 初始化根Agent
   */
  public async initialize(): Promise<void> {
    await super.initialize();
    this.updateStatus(AgentStatus.IDLE);
  }

  /**
   * 接收用户任务并执行
   */
  public async executeTask(task: ITask): Promise<ITaskResult> {
    this.updateStatus(AgentStatus.RUNNING);
    this.currentTask = task;
    
    try {
      // 1. 使用LLM拆解任务
      const subTasks = this.decomposeTask(task);
      
      // 2. 为每个子任务创建子Agent或分配给现有Agent
      const subTaskResults: ITaskResult[] = [];
      
      for (const subTask of subTasks) {
        // 检查是否有可用的子Agent
        let targetAgent = this.findAvailableChild();
        
        if (!targetAgent) {
          // 创建新的子Agent
          const childConfig: IAgentConfig = {
            name: `child-agent-${this.children.size + 1}`,
            type: AgentType.CHILD,
            template: 'ChildAgent',
            maxRetries: 3,
            timeout: 120000
          };
          targetAgent = this.addChild(childConfig);
          await targetAgent.initialize();
        }
        
        // 3. 分发任务
        const result = await this.dispatchTask(subTask, targetAgent);
        subTaskResults.push(result);
        
        // 如果子任务失败，尝试重建Agent并重试
        if (!result.success && targetAgent.status === AgentStatus.ERROR_LOOP) {
          console.log(`Agent ${targetAgent.id} 检测到错误循环，正在重建...`);
          const newAgent = await targetAgent.recreate();
          this.children.set(newAgent.id, newAgent);
          
          // 重试任务
          const retryResult = await this.dispatchTask(subTask, newAgent);
          subTaskResults[subTaskResults.length - 1] = retryResult;
        }
      }
      
      // 4. 聚合结果
      const finalResult = this.aggregateResults(subTaskResults);
      
      this.updateStatus(AgentStatus.COMPLETED);
      await this.reportResult(finalResult);
      
      return finalResult;
      
    } catch (error) {
      const errorResult: ITaskResult = {
        taskId: task.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date()
      };
      
      this.updateStatus(AgentStatus.FAILED);
      this.recordError(errorResult.error!);
      await this.reportResult(errorResult);
      
      return errorResult;
    }
  }

  /**
   * 使用LLM拆解任务
   * 这里使用模拟实现，实际应调用LLM API
   */
  public decomposeTask(task: ITask): ITask[] {
    // TODO: 集成LLM API进行任务拆解
    // 当前为简化实现，将任务拆分为2-3个子任务
    
    const subTasks: ITask[] = [];
    const descriptions = this.analyzeTaskDescription(task.description);
    
    for (let i = 0; i < descriptions.length; i++) {
      subTasks.push({
        id: uuidv4(),
        description: descriptions[i],
        context: {
          parentTaskId: task.id,
          step: i + 1,
          totalSteps: descriptions.length,
          originalContext: task.context
        },
        parentTaskId: task.id,
        createdAt: new Date()
      });
    }
    
    return subTasks;
  }

  /**
   * 分发任务给子Agent
   */
  public async dispatchTask(subTask: ITask, targetAgent?: IAgent): Promise<ITaskResult> {
    const agent = targetAgent || this.findAvailableChild();
    
    if (!agent) {
      throw new Error('No available child agent found');
    }
    
    // 确保任务上下文只包含父节点传递的明确指令
    const isolatedTask: ITask = {
      ...subTask,
      context: {
        instruction: subTask.description,
        step: subTask.context?.step,
        totalSteps: subTask.context?.totalSteps
        // 注意：不传递原始上下文的敏感信息
      }
    };
    
    return await agent.executeTask(isolatedTask);
  }

  /**
   * 聚合子任务结果
   */
  public aggregateResults(results: ITaskResult[]): ITaskResult {
    const allSuccess = results.every(r => r.success);
    const allSelfTestPassed = results.every(r => r.selfTestPassed);
    
    const outputs = results
      .filter(r => r.output)
      .map(r => r.output);
    
    const errors = results
      .filter(r => r.error)
      .map(r => r.error);
    
    return {
      taskId: this.currentTask?.id || 'unknown',
      success: allSuccess && allSelfTestPassed,
      output: {
        aggregated: true,
        subTaskCount: results.length,
        successCount: results.filter(r => r.success).length,
        selfTestPassedCount: results.filter(r => r.selfTestPassed).length,
        outputs,
        errors
      },
      error: errors.length > 0 ? errors.join('; ') : undefined,
      completedAt: new Date(),
      selfTestPassed: allSelfTestPassed
    };
  }

  /**
   * 查找可用的子Agent
   */
  private findAvailableChild(): IAgent | undefined {
    for (const child of this.children.values()) {
      if (child.status === AgentStatus.IDLE || child.status === AgentStatus.COMPLETED) {
        return child;
      }
    }
    return undefined;
  }

  /**
   * 分析任务描述，生成子任务列表
   * TODO: 替换为LLM调用
   */
  private analyzeTaskDescription(description: string): string[] {
    // 简单的任务分析逻辑
    // 实际应调用LLM进行智能拆解
    
    const keywords = ['分析', '设计', '实现', '测试', '部署', '优化'];
    const detectedSteps: string[] = [];
    
    for (const keyword of keywords) {
      if (description.includes(keyword)) {
        detectedSteps.push(`${keyword}相关任务`);
      }
    }
    
    // 如果没有检测到关键词，默认拆分为分析和执行
    if (detectedSteps.length === 0) {
      detectedSteps.push('分析任务需求', '执行任务', '验证结果');
    }
    
    return detectedSteps;
  }

  /**
   * 获取任务队列状态
   */
  public getTaskQueueStatus(): { pending: number; total: number } {
    return {
      pending: this.taskQueue.length,
      total: this.taskQueue.length + this.results.size
    };
  }
}