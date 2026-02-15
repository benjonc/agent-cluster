import OpenAI from 'openai';

/**
 * LLM 服务
 * 封装 Kimi API 调用，提供任务拆解和执行功能
 */
export class LLMService {
  private client: OpenAI;
  private model: string;
  private timeout: number;

  constructor(
    apiKey?: string,
    model: string = 'kimi-for-coding',
    baseURL: string = 'https://api.kimi.com/coding/v1',
    timeout: number = 60000
  ) {
    const key = apiKey || process.env.KIMI_API_KEY || process.env.KIMI_FOR_CODING_API_KEY;
    if (!key) {
      throw new Error('KIMI_API_KEY or KIMI_FOR_CODING_API_KEY is required. Please set it in environment variables.');
    }

    this.client = new OpenAI({
      apiKey: key,
      baseURL: baseURL,
      timeout: timeout,
      maxRetries: 1,
    });
    this.model = model;
    this.timeout = timeout;
  }

  /**
   * 从文本中提取 JSON
   * 增强版本：处理更多边缘情况
   */
  private extractJSON(text: string): { data: any; rawText: string; isJSON: boolean } {
    const trimmedText = text.trim();
    
    // 尝试直接解析
    try {
      const parsed = JSON.parse(trimmedText);
      console.log('[LLM] JSON parsed directly');
      return { data: parsed, rawText: text, isJSON: true };
    } catch (e) {
      // 继续尝试其他方法
    }

    // 尝试从 markdown 代码块中提取 (支持 ```json 和 ```)
    const codeBlockMatches = trimmedText.match(/```(?:json)?\s*([\s\S]*?)```/g);
    if (codeBlockMatches) {
      for (const match of codeBlockMatches) {
        const content = match.replace(/```(?:json)?\s*|```/g, '').trim();
        try {
          const parsed = JSON.parse(content);
          console.log('[LLM] JSON extracted from code block');
          return { data: parsed, rawText: text, isJSON: true };
        } catch (e) {
          // 继续尝试下一个代码块
        }
      }
    }

    // 尝试从文本中提取 JSON 对象/数组（支持嵌套）
    // 使用更精确的正则来匹配 JSON 对象
    const jsonObjectRegex = /\{[\s\S]*?\}(?=\s*$|\s*\n|\s*[^}])/g;
    const jsonArrayRegex = /\[[\s\S]*?\](?=\s*$|\s*\n|\s*[^\]])/g;
    
    // 先尝试匹配对象
    let jsonMatch = trimmedText.match(jsonObjectRegex);
    if (jsonMatch) {
      // 尝试找到最完整的匹配（从最长的开始）
      const candidates = jsonMatch.sort((a, b) => b.length - a.length);
      for (const candidate of candidates) {
        try {
          const parsed = JSON.parse(candidate);
          console.log('[LLM] JSON object extracted from text');
          return { data: parsed, rawText: text, isJSON: true };
        } catch (e) {
          // 继续尝试下一个
        }
      }
    }

    // 尝试匹配数组
    jsonMatch = trimmedText.match(jsonArrayRegex);
    if (jsonMatch) {
      const candidates = jsonMatch.sort((a, b) => b.length - a.length);
      for (const candidate of candidates) {
        try {
          const parsed = JSON.parse(candidate);
          console.log('[LLM] JSON array extracted from text');
          return { data: parsed, rawText: text, isJSON: true };
        } catch (e) {
          // 继续尝试下一个
        }
      }
    }

    // 尝试修复常见的 JSON 格式问题
    const fixedText = this.tryFixJSON(trimmedText);
    if (fixedText !== trimmedText) {
      try {
        const parsed = JSON.parse(fixedText);
        console.log('[LLM] JSON parsed after fixing format issues');
        return { data: parsed, rawText: text, isJSON: true };
      } catch (e) {
        // 修复失败
      }
    }

    console.log('[LLM] Failed to extract JSON, returning raw text');
    return { data: null, rawText: text, isJSON: false };
  }

  /**
   * 尝试修复常见的 JSON 格式问题
   */
  private tryFixJSON(text: string): string {
    let fixed = text.trim();
    
    // 移除可能的 BOM 标记
    fixed = fixed.replace(/^\uFEFF/, '');
    
    // 修复单引号为双引号
    fixed = fixed.replace(/'/g, '"');
    
    // 修复尾随逗号
    fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
    
    // 修复缺少引号的键（简单情况）
    fixed = fixed.replace(/(\{|,\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g, '$1"$2"$3');
    
    // 如果文本被包裹在引号中，尝试移除外层引号
    if (fixed.startsWith('"') && fixed.endsWith('"')) {
      try {
        // 尝试解析为 JSON 字符串（可能包含转义的 JSON）
        const unquoted = JSON.parse(fixed);
        if (typeof unquoted === 'string') {
          return unquoted.trim();
        }
      } catch (e) {
        // 不是有效的 JSON 字符串
      }
    }
    
    return fixed;
  }

  /**
   * 判断文本是否表示失败
   */
  private isFailureText(text: string): boolean {
    const failureIndicators = [
      'error', '失败', '错误', 'exception', 'timeout', '超时',
      'failed', 'unable', 'cannot', '不能', '无法', 'invalid', '无效'
    ];
    const lowerText = text.toLowerCase();
    return failureIndicators.some(indicator => lowerText.includes(indicator.toLowerCase()));
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

必须返回 JSON 格式，不要包含 markdown 代码块标记或其他文本。示例输出格式：
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
      console.log('[LLM] Starting task decomposition...');
      const startTime = Date.now();
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 1,
      }, {
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      
      const duration = Date.now() - startTime;
      console.log(`[LLM] Task decomposition completed in ${duration}ms`);

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from LLM');
      }

      // 解析 JSON 响应
      const extraction = this.extractJSON(content);
      console.log('[LLM] Raw response:', JSON.stringify(extraction.rawText).substring(0, 500));
      
      if (!extraction.isJSON) {
        console.warn('[LLM] Response is not valid JSON, using fallback parsing');
        // 尝试从文本中提取任务信息
        const lines = extraction.rawText.split('\n').filter(line => line.trim());
        const tasks = [];
        let currentTask: any = {};
        
        for (const line of lines) {
          const trimmed = line.trim();
          // 尝试识别任务描述
          if (trimmed.match(/^\d+[.\)]\s+/)) {
            if (currentTask.description) {
              tasks.push({...currentTask});
            }
            currentTask = {
              id: `subtask-${tasks.length + 1}`,
              description: trimmed.replace(/^\d+[.\)]\s+/, ''),
              priority: 5,
              dependencies: []
            };
          } else if (trimmed.includes(':') && !trimmed.startsWith('{') && !trimmed.startsWith('[')) {
            const [key, ...valueParts] = trimmed.split(':');
            const value = valueParts.join(':').trim();
            if (key && value) {
              const keyLower = key.toLowerCase().trim();
              if (keyLower.includes('desc')) currentTask.description = value;
              if (keyLower.includes('prior')) currentTask.priority = parseInt(value) || 5;
              if (keyLower.includes('depend')) currentTask.dependencies = value.split(',').map((s: string) => s.trim()).filter(Boolean);
            }
          }
        }
        
        if (currentTask.description) {
          tasks.push(currentTask);
        }
        
        if (tasks.length > 0) {
          console.log(`[LLM] Extracted ${tasks.length} tasks from text`);
          return tasks;
        }
        
        // 如果无法提取，抛出错误以使用默认任务
        throw new Error('Could not extract tasks from non-JSON response');
      }
      
      const parsed = extraction.data;
      
      // 尝试多种可能的字段名
      let subTasks = parsed;
      if (!Array.isArray(parsed)) {
        subTasks = parsed.tasks || parsed.subTasks || parsed.subtasks || 
                   parsed.taskList || parsed.data || parsed.result || 
                   parsed.items || parsed.steps || parsed.actions || [];
      }

      if (!Array.isArray(subTasks) || subTasks.length === 0) {
        console.warn('[LLM] No tasks found in response, using default');
        throw new Error('Invalid response format: expected array of tasks');
      }

      return subTasks.map((task: any, index: number) => ({
        id: task.id || `subtask-${index + 1}`,
        description: task.description || task.name || `子任务 ${index + 1}`,
        priority: task.priority || 5,
        dependencies: task.dependencies || []
      }));

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('[LLM] Task decomposition timed out');
      } else {
        console.error('[LLM] Task decomposition failed:', error);
      }
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

必须返回 JSON 格式，不要包含 markdown 代码块标记或其他文本。输出格式：
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
      console.log('[LLM] Starting task execution...');
      const startTime = Date.now();
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 1,
      }, {
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      
      const duration = Date.now() - startTime;
      console.log(`[LLM] Task execution completed in ${duration}ms`);

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from LLM');
      }

      const extraction = this.extractJSON(content);
      console.log('[LLM] Task execution response:', extraction.isJSON ? 'JSON' : 'Text', 
                  extraction.rawText.substring(0, 200));

      // 如果不是 JSON，直接返回文本内容
      if (!extraction.isJSON) {
        console.log('[LLM] Non-JSON response, returning as text output');
        const rawText = extraction.rawText.trim();
        // 基于文本内容判断成功/失败
        const isSuccess = !this.isFailureText(rawText);
        return {
          success: isSuccess,
          output: rawText,
          reasoning: 'Response was not in JSON format, treated as plain text output'
        };
      }

      const parsed = extraction.data;
      return {
        success: parsed.success ?? true,
        output: parsed.output || parsed.result || parsed.content || parsed.message || '任务执行完成',
        reasoning: parsed.reasoning || parsed.thought || parsed.explanation || undefined
      };

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('[LLM] Task execution timed out');
      } else {
        console.error('[LLM] Task execution failed:', error);
      }
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

必须返回 JSON 格式，不要包含 markdown 代码块标记或其他文本。输出格式：
{
  "passed": true/false,
  "feedback": "验证结果的详细说明，包括通过的原因或失败的具体问题"
}`;

    const userPrompt = `原始任务：${taskDescription}\n\n执行结果：\n${executionResult}\n\n请验证执行结果是否符合预期。`;

    try {
      console.log('[LLM] Starting self-test...');
      const startTime = Date.now();
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 1,
      }, {
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      
      const duration = Date.now() - startTime;
      console.log(`[LLM] Self-test completed in ${duration}ms`);

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from LLM');
      }

      const extraction = this.extractJSON(content);
      console.log('[LLM] Self-test response:', extraction.isJSON ? 'JSON' : 'Text', 
                  extraction.rawText.substring(0, 200));

      // 如果不是 JSON，基于文本内容判断通过/失败
      if (!extraction.isJSON) {
        console.log('[LLM] Non-JSON self-test response, analyzing text content');
        const rawText = extraction.rawText.toLowerCase();
        
        // 基于关键词判断
        const passIndicators = ['通过', 'pass', 'success', '合格', '符合', '正确', '满足', 'ok', 'good', '符合预期'];
        const failIndicators = ['失败', 'fail', 'error', '不合格', '不符合', '错误', '问题', '缺陷', '缺少', 'missing'];
        
        const passCount = passIndicators.filter(word => rawText.includes(word)).length;
        const failCount = failIndicators.filter(word => rawText.includes(word)).length;
        
        const passed = passCount > failCount || (!failIndicators.some(w => rawText.includes(w)) && rawText.length > 20);
        
        return {
          passed,
          feedback: extraction.rawText.trim()
        };
      }

      const parsed = extraction.data;
      return {
        passed: parsed.passed ?? parsed.success ?? parsed.result ?? false,
        feedback: parsed.feedback || parsed.message || parsed.comment || parsed.output || '验证完成'
      };

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('[LLM] Self-test timed out');
      } else {
        console.error('[LLM] Self test failed:', error);
      }
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
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages,
        temperature: 1
      }, {
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      return response.choices[0]?.message?.content || '';
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('[LLM] Chat timed out');
      } else {
        console.error('[LLM] Chat failed:', error);
      }
      return '';
    }
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
