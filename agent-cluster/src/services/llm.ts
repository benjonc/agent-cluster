import OpenAI from 'openai';

/**
 * LLM 服务
 * 封装 Kimi API 调用，提供任务拆解和执行功能
 */
export class LLMService {
  private client: OpenAI;
  private model: string;

  constructor(
    apiKey?: string,
    model: string = 'kimi-for-coding',
    baseURL: string = 'https://api.kimi.com/coding/v1'
  ) {
    const key = apiKey || process.env.KIMI_API_KEY || process.env.KIMI_FOR_CODING_API_KEY;
    if (!key) {
      throw new Error('KIMI_API_KEY or KIMI_FOR_CODING_API_KEY is required. Please set it in environment variables.');
    }

    this.client = new OpenAI({
      apiKey: key,
      baseURL: baseURL,
    });
    this.model = model;
  }

  /**
   * 任务拆解
   * 输入用户任务，返回子任务列表
   */
  public async decomposeTask(taskDescription: string): Promise<Array<{
    id: string;
    description: string;
    priority: number;
    dependencies: string[];
  }>> {
    const systemPrompt = `你是一个任务拆解专家。请将用户输入的复杂任务拆解为多个可独立执行的子任务。

要求：
1. 每个子任务应该是具体的、可执行的
2. 子任务之间应该有合理的依赖关系
3. 返回格式必须是合法的 JSON 数组
4. 每个子任务包含：id(唯一标识), description(任务描述), priority(优先级1-10), dependencies(依赖的子任务id列表)

示例输出格式：
[
  {
    "id": "task-1",
    "description": "分析需求并确定技术方案",
    "priority": 1,
    "dependencies": []
  },
  {
    "id": "task-2",
    "description": "实现核心功能模块",
    "priority": 2,
    "dependencies": ["task-1"]
  }
]`;

    const userPrompt = `请拆解以下任务：\n\n${taskDescription}`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from LLM');
      }

      // 解析 JSON 响应
      const parsed = JSON.parse(content);
      const subTasks = Array.isArray(parsed) ? parsed : parsed.tasks || parsed.subTasks || [];

      if (!Array.isArray(subTasks) || subTasks.length === 0) {
        throw new Error('Invalid response format: expected array of tasks');
      }

      return subTasks.map((task: any, index: number) => ({
        id: task.id || `subtask-${index + 1}`,
        description: task.description || task.name || `子任务 ${index + 1}`,
        priority: task.priority || 5,
        dependencies: task.dependencies || []
      }));

    } catch (error) {
      console.error('Task decomposition failed:', error);
      // 返回默认拆解结果
      return [
        {
          id: 'subtask-1',
          description: `分析任务需求: ${taskDescription}`,
          priority: 1,
          dependencies: []
        },
        {
          id: 'subtask-2',
          description: `执行任务: ${taskDescription}`,
          priority: 2,
          dependencies: ['subtask-1']
        },
        {
          id: 'subtask-3',
          description: `验证任务结果: ${taskDescription}`,
          priority: 3,
          dependencies: ['subtask-2']
        }
      ];
    }
  }

  /**
   * 任务执行
   * 输入具体任务，返回执行结果
   */
  public async executeTask(taskDescription: string, context?: Record<string, any>): Promise<{
    success: boolean;
    output: string;
    reasoning?: string;
  }> {
    const systemPrompt = `你是一个任务执行专家。请根据给定的任务描述，提供详细的执行结果。

要求：
1. 仔细分析任务需求
2. 提供具体的、可操作的解决方案
3. 如果任务涉及代码，提供完整的代码示例
4. 返回格式必须是合法的 JSON

输出格式：
{
  "success": true/false,
  "output": "执行结果的详细描述",
  "reasoning": "思考过程和推理逻辑（可选）"
}`;

    let userPrompt = `任务：${taskDescription}`;
    if (context && Object.keys(context).length > 0) {
      userPrompt += `\n\n上下文信息：\n${JSON.stringify(context, null, 2)}`;
    }

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.5,
        response_format: { type: 'json_object' }
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from LLM');
      }

      const parsed = JSON.parse(content);
      return {
        success: parsed.success ?? true,
        output: parsed.output || parsed.result || '任务执行完成',
        reasoning: parsed.reasoning || parsed.thought || undefined
      };

    } catch (error) {
      console.error('Task execution failed:', error);
      return {
        success: false,
        output: `任务执行失败: ${error instanceof Error ? error.message : String(error)}`,
        reasoning: '执行过程中发生错误'
      };
    }
  }

  /**
   * 自测验证
   * 验证任务执行结果是否符合预期
   */
  public async selfTest(taskDescription: string, executionResult: string): Promise<{
    passed: boolean;
    feedback: string;
  }> {
    const systemPrompt = `你是一个质量验证专家。请验证任务执行结果是否符合预期。

要求：
1. 检查执行结果是否完整
2. 检查是否存在明显错误或遗漏
3. 提供具体的改进建议（如有）
4. 返回格式必须是合法的 JSON

输出格式：
{
  "passed": true/false,
  "feedback": "验证结果的详细说明，包括通过的原因或失败的具体问题"
}`;

    const userPrompt = `原始任务：${taskDescription}\n\n执行结果：\n${executionResult}\n\n请验证执行结果是否符合预期。`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from LLM');
      }

      const parsed = JSON.parse(content);
      return {
        passed: parsed.passed ?? parsed.success ?? false,
        feedback: parsed.feedback || parsed.message || '验证完成'
      };

    } catch (error) {
      console.error('Self test failed:', error);
      return {
        passed: false,
        feedback: `验证过程出错: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * 通用聊天接口
   */
  public async chat(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: 0.7
    });

    return response.choices[0]?.message?.content || '';
  }
}

// 导出单例实例
let llmServiceInstance: LLMService | null = null;

export function getLLMService(): LLMService {
  if (!llmServiceInstance) {
    llmServiceInstance = new LLMService();
  }
  return llmServiceInstance;
}

export function setLLMService(service: LLMService): void {
  llmServiceInstance = service;
}
