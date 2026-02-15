# Agent Cluster

AI Agent 树形集群管理系统原型

## 核心特性

- **树形结构**: 父节点可创建/管理子节点
- **根Agent**: 用户入口，LLM 动态拆解任务
- **子Agent**: 动态创建，Agent.md 可复用，自测通过后上报完成
- **纠错机制**: 监控检测循环错误，父节点终止并重建新 Agent
- **上下文隔离**: 子Agent 零上下文，只接收父节点传递的明确指令

## 项目结构

```
agent-cluster/
├── src/
│   ├── core/
│   │   ├── Agent.ts       # Agent 基类，树形节点
│   │   ├── RootAgent.ts   # 根Agent，任务拆解
│   │   ├── ChildAgent.ts  # 子Agent，执行+自测
│   │   ├── Monitor.ts     # 监控器，检测循环错误
│   │   └── Storage.ts     # 存储层，Agent.md 持久化
│   ├── types/             # 类型定义
│   └── utils/             # 工具函数
├── agents/                # Agent.md 模板
├── tests/                 # 测试用例
├── package.json
└── tsconfig.json
```

## 快速开始

```bash
# 安装依赖
npm install

# 编译
npm run build

# 运行测试
npm test

# 开发模式
npm run dev
```

## 核心概念

### Agent 生命周期

1. **初始化** -> `initialize()`
2. **执行任务** -> `executeTask(task)`
3. **自测** -> `selfTest()` (仅子Agent)
4. **上报结果** -> `reportResult(result)`
5. **终止** -> `terminate(reason)`

### 错误循环检测

- 监控器定期检查 Agent 错误历史
- 连续相同错误超过阈值（默认3次）视为循环
- 触发重建：终止旧Agent，创建新Agent（新ID）

### 上下文隔离

- 子Agent只接收父节点传递的明确指令
- 原始上下文中的敏感信息被过滤
- 确保子Agent独立执行，不依赖外部状态