import {
  IMonitorEvent,
  MonitorEventType,
  AgentStatus,
  IAgent
} from '../types';
import { Agent } from './Agent';

/**
 * 监控器
 * 检测循环错误，触发纠错机制
 */
export class Monitor {
  private agent: Agent;
  private isRunning: boolean;
  private checkInterval?: NodeJS.Timeout;
  private eventHistory: IMonitorEvent[];
  private readonly CHECK_INTERVAL_MS = 5000; // 5秒检查一次
  private readonly ERROR_LOOP_THRESHOLD = 3; // 错误循环阈值
  private readonly MAX_EVENTS = 100;

  constructor(agent: Agent) {
    this.agent = agent;
    this.isRunning = false;
    this.eventHistory = [];
  }

  /**
   * 启动监控
   */
  public async start(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    
    // 启动定期检查
    this.checkInterval = setInterval(() => {
      this.performCheck();
    }, this.CHECK_INTERVAL_MS);
    
    console.log(`[Monitor] Started monitoring agent ${this.agent.id}`);
  }

  /**
   * 停止监控
   */
  public async stop(): Promise<void> {
    this.isRunning = false;
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
    
    console.log(`[Monitor] Stopped monitoring agent ${this.agent.id}`);
  }

  /**
   * 报告监控事件
   */
  public reportEvent(event: IMonitorEvent): void {
    this.eventHistory.push(event);
    
    // 限制事件历史大小
    if (this.eventHistory.length > this.MAX_EVENTS) {
      this.eventHistory.shift();
    }
    
    // 立即处理关键事件
    if (event.type === MonitorEventType.ERROR_DETECTED) {
      this.handleErrorEvent(event);
    }
    
    console.log(`[Monitor] Event reported: ${event.type} for agent ${event.agentId}`);
  }

  /**
   * 执行定期检查
   */
  private performCheck(): void {
    if (!this.isRunning) return;
    
    // 检查错误循环
    this.checkErrorLoop();
    
    // 检查超时
    this.checkTimeout();
    
    // 检查Agent健康状态
    this.checkAgentHealth();
  }

  /**
   * 检查错误循环
   */
  private checkErrorLoop(): void {
    if (this.agent.isInErrorLoop(this.ERROR_LOOP_THRESHOLD)) {
      const event: IMonitorEvent = {
        type: MonitorEventType.LOOP_DETECTED,
        agentId: this.agent.id,
        timestamp: new Date(),
        details: {
          errorHistory: this.agent['errorHistory'],
          threshold: this.ERROR_LOOP_THRESHOLD
        }
      };
      
      this.reportEvent(event);
      this.handleErrorLoop(event);
    }
  }

  /**
   * 检查任务超时
   */
  private checkTimeout(): void {
    const currentTask = this.agent['currentTask'];
    const config = this.agent['config'];
    
    if (!currentTask || !config.timeout) return;
    
    const taskStartTime = currentTask.createdAt.getTime();
    const currentTime = Date.now();
    const elapsedTime = currentTime - taskStartTime;
    
    if (elapsedTime > config.timeout) {
      const event: IMonitorEvent = {
        type: MonitorEventType.TIMEOUT,
        agentId: this.agent.id,
        timestamp: new Date(),
        details: {
          taskId: currentTask.id,
          elapsedTime,
          timeout: config.timeout
        }
      };
      
      this.reportEvent(event);
      this.handleTimeout(event);
    }
  }

  /**
   * 检查Agent健康状态
   */
  private checkAgentHealth(): void {
    // 检查Agent状态是否异常
    const status = this.agent.status;
    
    if (status === AgentStatus.ERROR_LOOP) {
      // 已经标记为错误循环，触发重建
      const event: IMonitorEvent = {
        type: MonitorEventType.LOOP_DETECTED,
        agentId: this.agent.id,
        timestamp: new Date(),
        details: { reason: 'Agent status is ERROR_LOOP' }
      };
      
      this.handleErrorLoop(event);
    }
  }

  /**
   * 处理错误事件
   */
  private handleErrorEvent(event: IMonitorEvent): void {
    const errorCount = event.details?.errorCount || 0;
    
    // 如果错误次数接近阈值，发出警告
    if (errorCount >= this.ERROR_LOOP_THRESHOLD - 1) {
      console.warn(`[Monitor] Agent ${this.agent.id} approaching error loop threshold (${errorCount}/${this.ERROR_LOOP_THRESHOLD})`);
    }
  }

  /**
   * 处理错误循环
   * 触发纠错机制：终止并重建Agent
   */
  private async handleErrorLoop(event: IMonitorEvent): Promise<void> {
    console.error(`[Monitor] Error loop detected for agent ${this.agent.id}`);
    
    // 更新Agent状态
    this.agent.updateStatus(AgentStatus.ERROR_LOOP);
    
    // 报告循环检测事件
    const loopEvent: IMonitorEvent = {
      type: MonitorEventType.LOOP_DETECTED,
      agentId: this.agent.id,
      timestamp: new Date(),
      details: event.details
    };
    
    this.eventHistory.push(loopEvent);
    
    // 通知父节点（如果有）
    if (this.agent.parentId) {
      // 父节点会检测到这个状态并触发重建
      console.log(`[Monitor] Notified parent ${this.agent.parentId} of error loop`);
    }
  }

  /**
   * 处理超时
   */
  private async handleTimeout(event: IMonitorEvent): Promise<void> {
    console.error(`[Monitor] Task timeout for agent ${this.agent.id}`);
    
    // 终止当前任务
    await this.agent.terminate('Task timeout');
  }

  /**
   * 获取监控统计
   */
  public getStats(): {
    totalEvents: number;
    errorEvents: number;
    loopEvents: number;
    timeoutEvents: number;
    isRunning: boolean;
  } {
    return {
      totalEvents: this.eventHistory.length,
      errorEvents: this.eventHistory.filter(e => e.type === MonitorEventType.ERROR_DETECTED).length,
      loopEvents: this.eventHistory.filter(e => e.type === MonitorEventType.LOOP_DETECTED).length,
      timeoutEvents: this.eventHistory.filter(e => e.type === MonitorEventType.TIMEOUT).length,
      isRunning: this.isRunning
    };
  }

  /**
   * 获取事件历史
   */
  public getEventHistory(): IMonitorEvent[] {
    return [...this.eventHistory];
  }

  /**
   * 清除事件历史
   */
  public clearHistory(): void {
    this.eventHistory = [];
  }
}