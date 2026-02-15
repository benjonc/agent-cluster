import OpenAI from 'openai';

async function test() {
  const client = new OpenAI({
    apiKey: 'sk-XbpoITUIBIRPqHxs5yo1r6kDufqnj9SJNWa87cnAMFZlcofQ',
    baseURL: 'https://api.moonshot.cn/v1',
    timeout: 30000,
  });
  
  console.log('Testing simple prompt...');
  const start = Date.now();
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    const response = await client.chat.completions.create({
      model: 'kimi-k2.5',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Break down this task into 3 subtasks: Design a Python script to analyze CSV sales data. Return as JSON array with id, description, priority, dependencies fields.' }
      ],
      temperature: 1,
    }, {
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    console.log('Response:', response.choices[0]?.message?.content);
    console.log('Time:', Date.now() - start, 'ms');
  } catch (error) {
    console.error('Error:', error);
  }
}

test();
