#!/usr/bin/env node

/**
 * API Performance Diagnostic Tool
 * 
 * This script helps diagnose why API calls from frontend might be slower
 * than direct calls from Postman or the server.
 * 
 * Usage: npm run diagnose:api
 */

const http = require('http');
const https = require('https');

const config = {
  baseURL: process.env.API_URL || 'http://localhost:4040',
  authToken: process.env.AUTH_TOKEN || '',
  storyId: process.env.STORY_ID || '8'
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[36m',
  bold: '\x1b[1m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const protocol = url.startsWith('https') ? https : http;
    
    const urlObj = new URL(url);
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.authToken}`,
        ...options.headers
      }
    };

    const req = protocol.request(requestOptions, (res) => {
      let data = '';
      let firstByteTime = null;

      res.on('data', (chunk) => {
        if (!firstByteTime) {
          firstByteTime = Date.now();
        }
        data += chunk;
      });

      res.on('end', () => {
        const totalTime = Date.now() - startTime;
        const ttfb = firstByteTime ? firstByteTime - startTime : 0;
        const downloadTime = totalTime - ttfb;

        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data,
          timing: {
            total: totalTime,
            ttfb: ttfb,
            download: downloadTime
          },
          size: Buffer.byteLength(data, 'utf8')
        });
      });
    });

    req.on('error', reject);
    
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    
    req.end();
  });
}

async function testEndpoint(name, url, options = {}) {
  log(`\n${colors.bold}Testing: ${name}${colors.reset}`, colors.blue);
  log(`URL: ${url}`);
  
  try {
    const results = [];
    const iterations = options.iterations || 10;

    for (let i = 0; i < iterations; i++) {
      const result = await makeRequest(url, options);
      results.push(result);
      
      const color = result.timing.total < 200 ? colors.green : 
                   result.timing.total < 500 ? colors.yellow : colors.red;
      
      log(`  Request ${i + 1}: ${result.timing.total}ms (TTFB: ${result.timing.ttfb}ms, Download: ${result.timing.download}ms)`, color);
    }

    // Calculate statistics
    const timings = results.map(r => r.timing.total);
    const ttfbs = results.map(r => r.timing.ttfb);
    const downloads = results.map(r => r.timing.download);
    
    const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
    const min = arr => Math.min(...arr);
    const max = arr => Math.max(...arr);
    const percentile = (arr, p) => {
      const sorted = [...arr].sort((a, b) => a - b);
      const index = Math.ceil((p / 100) * sorted.length) - 1;
      return sorted[index];
    };

    log(`\n${colors.bold}Statistics:${colors.reset}`);
    log(`  Average: ${avg(timings).toFixed(2)}ms`);
    log(`  Min: ${min(timings)}ms`);
    log(`  Max: ${max(timings)}ms`);
    log(`  P50: ${percentile(timings, 50)}ms`);
    log(`  P95: ${percentile(timings, 95)}ms`);
    log(`  P99: ${percentile(timings, 99)}ms`);
    
    log(`\n${colors.bold}Timing Breakdown:${colors.reset}`);
    log(`  Avg TTFB: ${avg(ttfbs).toFixed(2)}ms`);
    log(`  Avg Download: ${avg(downloads).toFixed(2)}ms`);
    
    log(`\n${colors.bold}Response:${colors.reset}`);
    log(`  Status: ${results[0].statusCode}`);
    log(`  Size: ${(results[0].size / 1024).toFixed(2)} KB`);
    log(`  Content-Type: ${results[0].headers['content-type']}`);
    log(`  Content-Encoding: ${results[0].headers['content-encoding'] || 'none'}`);
    
    // Check for performance issues
    const avgTime = avg(timings);
    const avgTTFB = avg(ttfbs);
    
    log(`\n${colors.bold}Analysis:${colors.reset}`);
    
    if (avgTime > 1000) {
      log(`  ⚠️  Average response time is SLOW (${avgTime.toFixed(0)}ms)`, colors.red);
    } else if (avgTime > 500) {
      log(`  ⚠️  Average response time is MODERATE (${avgTime.toFixed(0)}ms)`, colors.yellow);
    } else {
      log(`  ✓ Average response time is GOOD (${avgTime.toFixed(0)}ms)`, colors.green);
    }
    
    if (avgTTFB > 500) {
      log(`  ⚠️  TTFB is high - server processing is slow`, colors.red);
    } else if (avgTTFB > 200) {
      log(`  ⚠️  TTFB is moderate - some server delay`, colors.yellow);
    } else {
      log(`  ✓ TTFB is good - server responds quickly`, colors.green);
    }
    
    const downloadRatio = avg(downloads) / avgTime;
    if (downloadRatio > 0.5) {
      log(`  ⚠️  Download time is ${(downloadRatio * 100).toFixed(0)}% of total - network may be slow`, colors.yellow);
    }
    
    if (!results[0].headers['content-encoding']) {
      log(`  ⚠️  Response is not compressed - enable gzip/brotli`, colors.yellow);
    }

    return results;
    
  } catch (error) {
    log(`  ✗ Error: ${error.message}`, colors.red);
    throw error;
  }
}

async function testCORS() {
  log(`\n${colors.bold}${'='.repeat(60)}${colors.reset}`);
  log(`${colors.bold}CORS and Preflight Test${colors.reset}`, colors.blue);
  log(`${colors.bold}${'='.repeat(60)}${colors.reset}`);
  
  const url = `${config.baseURL}/api/v1/stories/${config.storyId}/versions`;
  
  // Test OPTIONS preflight
  try {
    log(`\nTesting OPTIONS preflight request...`);
    const result = await makeRequest(url, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:3000',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization,content-type'
      }
    });
    
    log(`  Status: ${result.statusCode}`);
    log(`  CORS Headers:`);
    log(`    Access-Control-Allow-Origin: ${result.headers['access-control-allow-origin'] || 'NOT SET'}`);
    log(`    Access-Control-Allow-Methods: ${result.headers['access-control-allow-methods'] || 'NOT SET'}`);
    log(`    Access-Control-Allow-Headers: ${result.headers['access-control-allow-headers'] || 'NOT SET'}`);
    log(`    Access-Control-Max-Age: ${result.headers['access-control-max-age'] || 'NOT SET'}`);
    
    if (!result.headers['access-control-allow-origin']) {
      log(`  ⚠️  CORS not properly configured!`, colors.red);
    }
  } catch (error) {
    log(`  ✗ Preflight failed: ${error.message}`, colors.red);
  }
}

async function testKeepAlive() {
  log(`\n${colors.bold}${'='.repeat(60)}${colors.reset}`);
  log(`${colors.bold}Connection Keep-Alive Test${colors.reset}`, colors.blue);
  log(`${colors.bold}${'='.repeat(60)}${colors.reset}`);
  
  const url = `${config.baseURL}/api/v1/stories/${config.storyId}/versions`;
  
  // First request
  const result1 = await makeRequest(url);
  log(`  First request: ${result1.timing.total}ms`);
  log(`  Connection: ${result1.headers.connection || 'NOT SET'}`);
  log(`  Keep-Alive: ${result1.headers['keep-alive'] || 'NOT SET'}`);
  
  // Subsequent requests (should reuse connection)
  const result2 = await makeRequest(url);
  log(`  Second request: ${result2.timing.total}ms`);
  
  const improvement = ((result1.timing.total - result2.timing.total) / result1.timing.total * 100);
  
  if (improvement > 10) {
    log(`  ✓ Connection reuse working (${improvement.toFixed(1)}% faster)`, colors.green);
  } else {
    log(`  ⚠️  Connection may not be reused efficiently`, colors.yellow);
  }
}

async function main() {
  log(`${colors.bold}${'='.repeat(60)}${colors.reset}`);
  log(`${colors.bold}API Performance Diagnostic Tool${colors.reset}`, colors.blue);
  log(`${colors.bold}${'='.repeat(60)}${colors.reset}`);
  
  log(`\nConfiguration:`);
  log(`  Base URL: ${config.baseURL}`);
  log(`  Story ID: ${config.storyId}`);
  log(`  Auth Token: ${config.authToken ? '✓ Set' : '✗ Not Set'}`);
  
  if (!config.authToken) {
    log(`\n⚠️  No auth token provided. Some tests may fail.`, colors.yellow);
    log(`   Set AUTH_TOKEN environment variable or login first.`);
  }

  try {
    // Test 1: Version History List
    await testEndpoint(
      'Get Version History',
      `${config.baseURL}/api/v1/stories/${config.storyId}/versions`,
      { iterations: 20 }
    );

    // Test 2: Single Version
    await testEndpoint(
      'Get Single Version',
      `${config.baseURL}/api/v1/stories/${config.storyId}/versions/5`,
      { iterations: 20 }
    );

    // Test 3: Version Comparison
    await testEndpoint(
      'Compare Versions',
      `${config.baseURL}/api/v1/stories/${config.storyId}/versions/compare`,
      { 
        method: 'POST',
        body: { fromVersionNumber: 1, toVersionNumber: 5 },
        iterations: 10
      }
    );

    // Test 4: CORS and Preflight
    await testCORS();

    // Test 5: Keep-Alive
    await testKeepAlive();

    // Summary and Recommendations
    log(`\n${colors.bold}${'='.repeat(60)}${colors.reset}`);
    log(`${colors.bold}Recommendations${colors.reset}`, colors.blue);
    log(`${colors.bold}${'='.repeat(60)}${colors.reset}`);
    
    log(`\n${colors.bold}Frontend Performance Tips:${colors.reset}`);
    log(`  1. Enable HTTP/2 or HTTP/3 for multiplexing`);
    log(`  2. Use connection pooling with keep-alive`);
    log(`  3. Implement request caching (React Query, SWR)`);
    log(`  4. Add loading states to improve perceived performance`);
    log(`  5. Consider pagination for large datasets`);
    log(`  6. Use debouncing for rapid API calls`);
    log(`  7. Check browser DevTools Network tab for waterfall`);
    
    log(`\n${colors.bold}Backend Performance Tips:${colors.reset}`);
    log(`  1. Enable response compression (gzip/brotli)`);
    log(`  2. Add database query indices`);
    log(`  3. Implement Redis caching`);
    log(`  4. Use database connection pooling`);
    log(`  5. Optimize SQL queries (use EXPLAIN)`);
    log(`  6. Consider pagination limits`);
    log(`  7. Add CDN for static assets`);

  } catch (error) {
    log(`\nFatal error: ${error.message}`, colors.red);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testEndpoint, makeRequest };
