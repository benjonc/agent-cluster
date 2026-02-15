import { v4 as uuidv4 } from 'uuid';
import {
  IAgent,
  IAgentConfig,
  IAgentState,
  IAgentContext,
  ITask,
  ITaskResult,
  AgentStatus,
  AgentType,
  IMonitorEvent,
  MonitorEventType
} from '../types';
import { Storage } from './Storage';
import { Monitor } from './Monitor';

/**
 * Agent 基类
 * 实现树形节点结构和通用功能
 */
export abstract class Agent implements IAgent {
  public readonly id: string;
  public readonly name: string;
  public readonly type: AgentType;
  public readonly parentId?: string;
  public readonly createdAt: Date;
  
  public status: AgentStatus;
  public children: Map<string, IAgent>;
  public currentTask?: ITask;
  
  // 新增字段
  public description: string;
  public template: string;
  public context: IAgentContext;
  
  protected config: IAgentConfig;
  protected storage: Storage;
  protected monitor?: Monitor;
  protected errorCount: number;
  protected lastError?: string;
  protected errorHistory: string[];
  protected updatedAt: Date;

  constructor(config: IAgentConfig) {
    this.id = config.id || uuidv4();
    this.name = config.name;
    this.type = config.type;
    this.parentId = config.parentId;
    this.config = {
      maxRetries: 3,
      timeout: 300000, // 5分钟
      enableMonitor: true,
      description: '',
      template: 'ChildAgent',
      ...config
    };
    
    this.status = AgentStatus.IDLE;
    this.children = new Map();
    this.createdAt = new Date();
    this.updatedAt = new Date();
    this.errorCount = 0;
    this.errorHistory = [];
    
    // 初始化新增字段
    this.description = this.config.description || '';
    this.template = this.config.template || 'ChildAgent';
    this.context = this.createEmptyContext();
    
    this.storage = Storage.getInstance();
    
    if (this.config.enableMonitor) {
      this.monitor = new Monitor(this);
    }
  }

  /**
   * 初始化 Agent
   */
  public async initialize(): Promise<void> {
    // 确保存储目录已初始化
    await this.storage.initialize();
    
    this.updateStatus(AgentStatus.IDLE);
    await this.saveState();
    
    if (this.monitor) {
      await this.monitor.start();
    }
  }

  /**
   * 执行任务的抽象方法，由子类实现
   */
  public abstract executeTask(task: ITask): Promise<ITaskResult>;

  /**
   * 终止 Agent
   */
  public async terminate(reason?: string): Promise<void> {
    this.updateStatus(AgentStatus.TERMINATED);
    
    // 终止所有子Agent
    for (const child of this.children.values()) {
      await child.terminate(`Parent agent ${this.id} terminated: ${reason || 'unknown'}`);
    }
    
    if (this.monitor) {
      await this.monitor.stop();
    }
    
    this.updatedAt = new Date();
    await this.saveState();
  }

  /**
   * 添加子Agent
   */
  public addChild(config: IAgentConfig): IAgent {
    if (this.type !== AgentType.ROOT && this.children.size >= 1) {
      throw new Error('Only root agent can have multiple children');
    }
    
    const childConfig: IAgentConfig = {
      ...config,
      parentId: this.id,
      type: AgentType.CHILD
    };
    
    // ChildAgent 将在单独文件中实现，这里先返回类型
    // 实际使用时需要导入 ChildAgent
    const { ChildAgent } = require('./ChildAgent');
    const child = new ChildAgent(childConfig);
    this.children.set(child.id, child);
    
    // 更新自己的状态
    this.updatedAt = new Date();
    this.saveState().catch(console.error);
    
    return child;
  }

  /**
   * 移除子Agent
   */
  public removeChild(agentId: string): boolean {
    const child = this.children.get(agentId);
    if (!child) return false;
    
    child.terminate('Removed by parent');
    this.children.delete(agentId);
    
    // 更新自己的状态
    this.updatedAt = new Date();
    this.saveState().catch(console.error);
    
    return true;
  }

  /**
   * 获取子Agent
   */
  public getChild(agentId: string): IAgent | undefined {
    return this.children.get(agentId);
  }

  /**
   * 获取所有后代Agent
   */
  public getAllDescendants(): IAgent[] {
    const descendants: IAgent[] = [];
    
    for (const child of this.children.values()) {
      descendants.push(child);
      descendants.push(...child.getAllDescendants());
    }
    
    return descendants;
  }

  /**
   * 更新状态
   */
  public updateStatus(status: AgentStatus): void {
    const oldStatus = this.status;
    this.status = status;
    this.updatedAt = new Date();
    
    // 触发状态变更事件
    this.onStatusChange(oldStatus, status);
    
    // 自动保存状态
    this.saveState().catch(console.error);
  }

  /**
   * 上报结果
   */
  public async reportResult(result: ITaskResult): Promise<void> {
    this.updatedAt = new Date();
    await this.saveState();
    
    // 如果有父节点，向父节点报告
    if (this.parentId) {
      await this.notifyParent(result);
    }
  }

  /**
   * 获取当前状态（新的结构化格式）
   */
  public getState(): IAgentState {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      description: this.description,
      context: this.context,
      template: this.template,
      parentId: this.parentId,
      childrenIds: Array.from(this.children.keys()),
      status: this.status,
      currentTask: this.currentTask,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      errorCount: this.errorCount,
      errorHistory: this.errorHistory,
      lastError: this.lastError,
      config: this.config
    };
  }

  /**
   * 从状态加载
   */
  public async loadState(state: IAgentState): Promise<void> {
    // 注意：id, name, type, parentId, createdAt 是只读的，不加载
    this.description = state.description;
    this.context = state.context;
    this.template = state.template;
    this.status = state.status;
    this.currentTask = state.currentTask;
    this.errorCount = state.errorCount;
    this.errorHistory = state.errorHistory;
    this.lastError = state.lastError;
    this.config = { ...this.config, ...state.config };
    this.updatedAt = new Date();
    
    // 保存到存储
    await this.saveState();
  }

  /**
   * 保存状态到存储
   */
  protected async saveState(): Promise<void> {
    await this.storage.saveAgentState(this.id, this.getState());
    await this.storage.saveContext(this.id, this.context);
  }

  /**
   * 添加对话记录
   */
  public async addConversationEntry(
    role: 'user' | 'assistant' | 'system', 
    content: string
  ): Promise<void> {
    const entry = {
      role,
      content,
      timestamp: new Date()
    };
    this.context.conversationHistory.push(entry);
    await this.storage.appendToConversation(this.id, entry);
  }

  /**
   * 添加执行日志
   */
  public async addExecutionLog(action: string, result: string): Promise<void> {
    const entry = {
      action,
      result,
      timestamp: new Date()
    };
    this.context.executionLog.push(entry);
    await this.storage.appendToExecutionLog(this.id, entry);
  }

  /**
   * 更新任务状态
   */
  public updateTaskState(update: Partial<NonNullable<IAgentContext['taskState']>>): void {
    if (!this.context.taskState) {
      this.context.taskState = {
        taskHistory: [],
        completedTasks: []
      };
    }
    this.context.taskState = {
      ...this.context.taskState,
      ...update
    };
  }

  /**
   * 设置自定义上下文数据
   */
  public setCustomData(key: string, value: any): void {
    if (!this.context.customData) {
      this.context.customData = {};
    }
    this.context.customData[key] = value;
  }

  /**
   * 获取自定义上下文数据
   */
  public getCustomData(key: string): any {
    return this.context.customData?.[key];
  }

  /**
   * 记录错误
   */
  protected recordError(error: string): void {
    this.errorCount++;
    this.lastError = error;
    this.errorHistory.push(error);
    this.updatedAt = new Date();
    
    // 保留最近20条错误记录
    if (this.errorHistory.length > 20) {
      this.errorHistory.shift();
    }
    
    // 检查是否需要触发监控事件
    if (this.monitor) {
      this.monitor.reportEvent({
        type: MonitorEventType.ERROR_DETECTED,
        agentId: this.id,
        timestamp: new Date(),
        details: { error, errorCount: this.errorCount }
      });
    }
    
    // 保存状态
    this.saveState().catch(console.error);
  }

  /**
   * 状态变更钩子
   */
  protected onStatusChange(oldStatus: AgentStatus, newStatus: AgentStatus): void {
    // 子类可以覆盖此方法
  }

  /**
   * 通知父节点
   */
  protected async notifyParent(result: ITaskResult): Promise<void> {
    // 通过存储层或消息队列实现
    // 这里使用存储层作为简单实现
    await this.storage.saveAgentState(`${this.parentId}_child_result_${this.id}`, {
      ...this.getState(),
      childId: this.id,
      result,
      reportedAt: new Date()
    } as IAgentState);
  }

  /**
   * 检查是否处于错误循环
   */
  public isInErrorLoop(threshold: number = 3): boolean {
    if (this.errorHistory.length < threshold) return false;
    
    // 检查最近的错误是否重复
    const recentErrors = this.errorHistory.slice(-threshold);
    const uniqueErrors = new Set(recentErrors);
    
    // 如果最近 threshold 次错误都相同，认为是循环
    return uniqueErrors.size === 1;
  }

  /**
   * 重建Agent（用于纠错机制）
   */
  public async recreate(): Promise<IAgent> {
    await this.terminate('Recreating due to error loop');
    
    const newConfig: IAgentConfig = {
      ...this.config,
      id: uuidv4(), // 新ID
      enableMonitor: true
    };
    
    // 根据类型创建新的Agent
    if (this.type === AgentType.ROOT) {
      const { RootAgent } = require('./RootAgent');
      const newAgent = new RootAgent(newConfig);
      await newAgent.initialize();
      return newAgent;
    } else {
      const { ChildAgent } = require('./ChildAgent');
      const newAgent = new ChildAgent(newConfig);
      await newAgent.initialize();
      return newAgent;
    }
  }

  /**
   * 创建空上下文
   */
  protected createEmptyContext(): IAgentContext {
    return {
      conversationHistory: [],
      taskState: {
        taskHistory: [],
        completedTasks: []
      },
      executionLog: []
    };
  }

  /**
   * 加载 Agent.md 模板
   */
  public async loadAgentMd(): Promise<string> {
    const content = await this.storage.loadAgentMd(this.template);
    if (!content) {
      throw new Error(`Agent template not found: ${this.template}`);
    }
    return content;
  }
}
