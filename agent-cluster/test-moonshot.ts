import OpenAI from 'openai';

async function test() {
  const client = new OpenAI({
    apiKey: 'sk-XbpoITUIBIRPqHxs5yo1r6kDufqnj9SJNWa87cnAMFZlcofQ',
    baseURL: 'https://api.moonshot.cn/v1',
    timeout: 30000,
  });
  
  const systemPrompt = `你是一个任务拆解专家。请将用户输入的复杂任务拆解为多个可独立执行的子任务。返回 JSON 数组格式。`;

  const userPrompt = `请拆解以下任务：设计一个Python脚本，用于分析CSV文件中的销售数据，生成包含总销售额、平均订单价值和最畅销产品的报告。

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
  }
]`;

  console.log('Testing with moonshot-v1-8k...');
  const start = Date.now();
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    const response = await client.chat.completions.create({
      model: 'moonshot-v1-8k',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 1,
    }, {
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    console.log('Response:', response.choices[0]?.message?.content);
    console.log('Time:', Date.now() - start, 'ms');
  } catch (error: any) {
    console.error('Error:', error.message || error);
  }
}

test();
