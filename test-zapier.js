const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');

async function testConnection() {
  try {
    // Test with a dummy URL to see if the connection logic works
    const url = 'https://actions.zapier.com/api/v1/mcp/?token=test123';
    const transport = new StreamableHTTPClientTransport(new URL(url));
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    
    console.log('Transport created:', !!transport);
    console.log('Client created:', !!client);
    
    // Try to connect (this will fail with dummy URL but shows if code structure is correct)
    try {
      await client.connect(transport);
      console.log('Connected successfully');
      const result = await client.listTools();
      console.log('Tools:', result.tools);
    } catch (connectErr) {
      console.log('Connection error (expected with dummy URL):', connectErr.message);
    }
  } catch (err) {
    console.error('Setup error:', err.message);
    console.error('Stack:', err.stack);
  }
}

testConnection();
