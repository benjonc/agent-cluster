/**
 * 生成唯一ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 延迟函数
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 深克隆对象
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * 验证任务描述是否有效
 */
export function isValidTaskDescription(description: string): boolean {
  return typeof description === 'string' && description.trim().length > 0;
}

/**
 * 格式化错误信息
 */
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * 截断字符串
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...';
}

/**
 * 安全地解析JSON
 */
export function safeJsonParse<T>(json: string, defaultValue: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * 合并上下文对象
 * 确保子Agent只接收明确指令
 */
export function mergeContext(
  parentContext: Record<string, any>,
  childInstruction: string
): Record<string, any> {
  // 只传递明确的指令，过滤敏感信息
  return {
    instruction: childInstruction,
    timestamp: new Date().toISOString()
  };
}