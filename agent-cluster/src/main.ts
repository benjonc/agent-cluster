// 主入口 - 导出所有模块
export * from './types';
export * from './core';
export * from './services';

// 保持向后兼容的默认导出
import { main } from './index';
export { main };
