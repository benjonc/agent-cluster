import OpenAI from 'openai';

async function test() {
  const client = new OpenAI({
    apiKey: 'sk-XbpoITUIBIRPqHxs5yo1r6kDufqnj9SJNWa87cnAMFZlcofQ',
    baseURL: 'https://api.moonshot.cn/v1',
    timeout: 30000,
  });
  
  console.log('Testing API with JSON format...');
  const start = Date.now();
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    const response = await client.chat.completions.create({
      model: 'kimi-k2.5',
      messages: [
        { role: 'system', content: 'You are a helpful assistant. Return JSON format.' },
        { role: 'user', content: 'List 3 tasks' }
      ],
      temperature: 1,
      response_format: { type: 'json_object' }
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
