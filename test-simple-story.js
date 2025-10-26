const axios = require('axios');

async function testSimpleStory() {
  try {
    // First login
    console.log('Logging in...');
    const loginResponse = await axios.post('http://localhost:4040/api/v1/auth/login', {
      email: 'admin@susano.dev',
      password: 'Admin@123'
    });

    const token = loginResponse.data.data.accessToken;
    console.log('Login successful');

    // Test story creation WITHOUT tags first
    console.log('Creating story without tags...');
    const storyResponse = await axios.post('http://localhost:4040/api/v1/stories', {
      title: 'Test Story Simple',
      details: 'This is a test story without tags',
      type: 'REPORT',
      status: 'DRAFT',
      priority: 'NORMAL'
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('Story created successfully:', storyResponse.data);

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testSimpleStory();