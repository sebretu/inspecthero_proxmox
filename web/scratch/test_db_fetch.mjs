import fetch from 'node-fetch';

async function test() {
  const planId = '31ee9b79-6090-4edd-8b16-579f94091460';
  const url = 'https://api.inspecthero.pl/rest/v1/plans?id=eq.' + planId;
  
  console.log('Fetching plan from:', url);
  const res = await fetch(url, {
    headers: {
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3Nzk3Mjg5NDMsImV4cCI6MjA5NTA4ODk0M30.puiELZCZvCy0vYoMAnjZRiYaVJ3UhdBvkSh9UYtmRbQ',
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3Nzk3Mjg5NDMsImV4cCI6MjA5NTA4ODk0M30.puiELZCZvCy0vYoMAnjZRiYaVJ3UhdBvkSh9UYtmRbQ'
    }
  });
  
  console.log('Response status:', res.status);
  const json = await res.json();
  console.log('Response JSON:', JSON.stringify(json, null, 2));
}

test().catch(console.error);
