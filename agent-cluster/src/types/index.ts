/**
 * Agent 状态枚举
 */
export enum AgentStatus {
  IDLE = 'idle',           // 空闲
  PENDING = 'pending',     // 等待分配任务
  RUNNING = 'running',     // 执行中
  COMPLETED = 'completed', // 已完成
  FAILED = 'failed',       // 失败
  TERMINATED = 'terminated', // 已终止
  ERROR_LOOP = 'error_loop'  // 检测到错误循环
}

/**
 * Agent 类型枚举
 */
export enum AgentType {
  ROOT = 'root',   // 根Agent
  CHILD = 'child'  // 子Agent
}

/**
 * Agent 上下文接口
 * 存储对话历史、任务状态、执行记录
 */
export interface IAgentContext {
  /** 对话历史 */
  conversationHistory: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
  }>;
  /** 任务状态 */
  taskState?: {
    currentTaskId?: string;
    taskHistory: string[];
    completedTasks: string[];
  };
  /** 执行记录 */
  executionLog: Array<{
    action: string;
    result: string;
    timestamp: Date;
  }>;
  /** 自定义上下文数据 */
  customData?: Record<string, any>;
}

/**
 * Agent 存储状态接口
 * 用于持久化的完整状态结构
 */
export interface IAgentState {
  /** 唯一标识 - Agent 的通讯地址，树形路径如 "root/child-a/grandchild-1" */
  id: string;
  /** 名称 */
  name: string;
  /** Agent 类型 */
  type: AgentType;
  /** 描述 - Agent 的角色、能力概述 */
  description: string;
  /** 上下文 - 对话历史、任务状态、执行记录 */
  context: IAgentContext;
  /** Agent.md 模板名 - 复用时知道加载哪个模板 */
  template: string;
  /** 父节点引用 - 用于消息路由 */
  parentId?: string;
  /** 子节点列表 - 管理下游 Agent */
  childrenIds: string[];
  /** 状态 - idle/running/error/completed */
  status: AgentStatus;
  /** 当前任务 */
  currentTask?: ITask;
  /** 创建时间 */
  createdAt: Date;
  /** 更新时间 */
  updatedAt: Date;
  /** 错误计数 */
  errorCount: number;
  /** 错误历史 */
  errorHistory: string[];
  /** 最后错误信息 */
  lastError?: string;
  /** 配置信息 */
  config: IAgentConfig;
  /** 终止信息（如已终止） */
  terminatedAt?: Date;
  terminateReason?: string;
  /** 最后执行结果 */
  lastResult?: ITaskResult;
}

/**
 * 任务接口
 */
export interface ITask {
  id: string;
  description: string;
  context?: Record<string, any>;  // 任务上下文（父节点传递的明确指令）
  parentTaskId?: string;
  createdAt: Date;
  deadline?: Date;
}

/**
 * 任务结果接口
 */
export interface ITaskResult {
  taskId: string;
  success: boolean;
  output?: any;
  error?: string;
  completedAt: Date;
  selfTestPassed?: boolean;  // 自测是否通过
}

/**
 * Agent 配置接口
 */
export interface IAgentConfig {
  id?: string;
  name: string;
  type: AgentType;
  parentId?: string;
  agentMdPath?: string;  // Agent.md 模板路径
  maxRetries?: number;   // 最大重试次数
  timeout?: number;      // 任务超时时间（毫秒）
  enableMonitor?: boolean; // 是否启用监控
  description?: string;  // Agent 描述
  template?: string;     // Agent.md 模板名
}

/**
 * Agent 接口
 */
export interface IAgent {
  id: string;
  name: string;
  type: AgentType;
  status: AgentStatus;
  parentId?: string;
  children: Map<string, IAgent>;
  currentTask?: ITask;
  
  // 核心方法
  initialize(): Promise<void>;
  executeTask(task: ITask): Promise<ITaskResult>;
  terminate(reason?: string): Promise<void>;
  
  // 树形结构方法
  addChild(config: IAgentConfig): IAgent;
  removeChild(agentId: string): boolean;
  getChild(agentId: string): IAgent | undefined;
  getAllDescendants(): IAgent[];
  
  // 状态管理
  updateStatus(status: AgentStatus): void;
  reportResult(result: ITaskResult): Promise<void>;
  
  // 存储相关
  getState(): IAgentState;
  loadState(state: IAgentState): Promise<void>;
  
  // 纠错机制
  isInErrorLoop(threshold?: number): boolean;
  recreate(): Promise<IAgent>;
}

/**
 * 监控事件类型
 */
export enum MonitorEventType {
  ERROR_DETECTED = 'error_detected',
  LOOP_DETECTED = 'loop_detected',
  TIMEOUT = 'timeout',
  AGENT_TERMINATED = 'agent_terminated',
  AGENT_RECREATED = 'agent_recreated'
}

/**
 * 监控事件接口
 */
export interface IMonitorEvent {
  type: MonitorEventType;
  agentId: string;
  timestamp: Date;
  details?: Record<string, any>;
}

/**
 * 存储接口
 */
export interface IStorage {
  // Agent 状态存储（新的结构化存储）
  saveAgentState(agentId: string, state: IAgentState): Promise<void>;
  loadAgentState(agentId: string): Promise<IAgentState | null>;
  deleteAgentState(agentId: string): Promise<void>;
  listAgentStates(): Promise<string[]>;
  
  // Agent.md 模板存储
  saveAgentMd(name: string, content: string): Promise<void>;
  loadAgentMd(name: string): Promise<string | null>;
  listAgentMds(): Promise<string[]>;
  deleteAgentMd(name: string): Promise<void>;
  
  // 上下文存储（支持增量更新）
  saveContext(agentId: string, context: IAgentContext): Promise<void>;
  loadContext(agentId: string): Promise<IAgentContext | null>;
  appendToConversation(agentId: string, entry: IAgentContext['conversationHistory'][0]): Promise<void>;
  appendToExecutionLog(agentId: string, entry: IAgentContext['executionLog'][0]): Promise<void>;
}

/**
 * 根Agent 特有接口
 */
export interface IRootAgent extends IAgent {
  decomposeTask(task: ITask): Promise<ITask[]>;  // 拆解任务（异步，调用LLM）
  dispatchTask(subTask: ITask, targetAgent?: IAgent): Promise<ITaskResult>;
  aggregateResults(results: ITaskResult[]): ITaskResult;
}

/**
 * 子Agent 特有接口
 */
export interface IChildAgent extends IAgent {
  selfTest(): Promise<boolean>;  // 自测
  loadAgentMd(): Promise<string>; // 加载 Agent.md 模板
  reportToParent(result: ITaskResult): Promise<void>;
}
