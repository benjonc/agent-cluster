import OpenAI from 'openai';

async function test() {
  const client = new OpenAI({
    apiKey: 'sk-XbpoITUIBIRPqHxs5yo1r6kDufqnj9SJNWa87cnAMFZlcofQ',
    baseURL: 'https://api.moonshot.cn/v1',
    timeout: 10000,
  });
  
  // 测试不同模型
  const models = ['kimi-k2.5', 'kimi-latest', 'moonshot-v1-8k'];
  
  for (const model of models) {
    console.log(`\nTesting model: ${model}`);
    const start = Date.now();
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await client.chat.completions.create({
        model: model,
        messages: [
          { role: 'user', content: 'Say hello' }
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
}

test();
