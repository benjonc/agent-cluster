import { IStorage, IAgentState, IAgentContext } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * 存储层
 * 负责 Agent.md 持久化和状态存储
 */
export class Storage implements IStorage {
  private static instance: Storage;
  private basePath: string;
  private agentsPath: string;
  private statesPath: string;
  private contextsPath: string;

  private constructor() {
    this.basePath = process.env.AGENT_CLUSTER_STORAGE || './data';
    this.agentsPath = path.join(process.cwd(), 'agents');
    this.statesPath = path.join(this.basePath, 'states');
    this.contextsPath = path.join(this.basePath, 'contexts');
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): Storage {
    if (!Storage.instance) {
      Storage.instance = new Storage();
    }
    return Storage.instance;
  }

  /**
   * 初始化存储目录
   */
  public async initialize(): Promise<void> {
    await fs.mkdir(this.agentsPath, { recursive: true });
    await fs.mkdir(this.statesPath, { recursive: true });
    await fs.mkdir(this.contextsPath, { recursive: true });
  }

  /**
   * 保存Agent状态（新的结构化存储）
   */
  public async saveAgentState(agentId: string, state: IAgentState): Promise<void> {
    const filePath = path.join(this.statesPath, `${agentId}.json`);
    // 确保父目录存在（处理树形路径如 root/child-a/grandchild-1）
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const data = JSON.stringify(state, null, 2);
    await fs.writeFile(filePath, data, 'utf-8');
  }

  /**
   * 加载Agent状态
   */
  public async loadAgentState(agentId: string): Promise<IAgentState | null> {
    const filePath = path.join(this.statesPath, `${agentId}.json`);
    
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(data);
      // 恢复日期对象
      return this.reviveDates(parsed);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * 删除Agent状态
   */
  public async deleteAgentState(agentId: string): Promise<void> {
    const filePath = path.join(this.statesPath, `${agentId}.json`);
    
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
    
    // 同时删除上下文
    await this.deleteContext(agentId);
  }

  /**
   * 列出所有Agent状态
   */
  public async listAgentStates(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.statesPath);
      return files
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''));
    } catch (error) {
      return [];
    }
  }

  /**
   * 保存Agent.md模板
   */
  public async saveAgentMd(name: string, content: string): Promise<void> {
    const filePath = path.join(this.agentsPath, `${name}.md`);
    await fs.writeFile(filePath, content, 'utf-8');
  }

  /**
   * 加载Agent.md模板
   */
  public async loadAgentMd(name: string): Promise<string | null> {
    const filePath = path.join(this.agentsPath, `${name}.md`);
    
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * 列出所有Agent.md模板
   */
  public async listAgentMds(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.agentsPath);
      return files
        .filter(f => f.endsWith('.md'))
        .map(f => f.replace('.md', ''));
    } catch (error) {
      return [];
    }
  }

  /**
   * 删除Agent.md模板
   */
  public async deleteAgentMd(name: string): Promise<void> {
    const filePath = path.join(this.agentsPath, `${name}.md`);
    
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * 保存上下文
   */
  public async saveContext(agentId: string, context: IAgentContext): Promise<void> {
    const filePath = path.join(this.contextsPath, `${agentId}.json`);
    // 确保父目录存在
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const data = JSON.stringify(context, null, 2);
    await fs.writeFile(filePath, data, 'utf-8');
  }

  /**
   * 加载上下文
   */
  public async loadContext(agentId: string): Promise<IAgentContext | null> {
    const filePath = path.join(this.contextsPath, `${agentId}.json`);
    
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      if (!data.trim()) {
        return null;
      }
      const parsed = JSON.parse(data);
      return this.reviveDates(parsed);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      // 处理 JSON 解析错误或其他错误
      return null;
    }
  }

  /**
   * 删除上下文
   */
  public async deleteContext(agentId: string): Promise<void> {
    const filePath = path.join(this.contextsPath, `${agentId}.json`);
    
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * 追加对话记录
   */
  public async appendToConversation(
    agentId: string, 
    entry: IAgentContext['conversationHistory'][0]
  ): Promise<void> {
    const context = await this.loadContext(agentId) || this.createEmptyContext();
    context.conversationHistory.push(entry);
    await this.saveContext(agentId, context);
  }

  /**
   * 追加执行日志
   */
  public async appendToExecutionLog(
    agentId: string, 
    entry: IAgentContext['executionLog'][0]
  ): Promise<void> {
    const context = await this.loadContext(agentId) || this.createEmptyContext();
    context.executionLog.push(entry);
    await this.saveContext(agentId, context);
  }

  /**
   * 设置基础路径（用于测试）
   */
  public setBasePath(basePath: string): void {
    this.basePath = basePath;
    this.agentsPath = path.join(basePath, 'agents');
    this.statesPath = path.join(basePath, 'states');
    this.contextsPath = path.join(basePath, 'contexts');
  }

  /**
   * 创建空上下文
   */
  private createEmptyContext(): IAgentContext {
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
   * 恢复日期对象（JSON.parse 后日期变为字符串）
   */
  private reviveDates(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.reviveDates(item));
    }

    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string' && /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
        result[key] = new Date(value);
      } else if (typeof value === 'object') {
        result[key] = this.reviveDates(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
}
