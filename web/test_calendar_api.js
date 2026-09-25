
const fetch = require('node-fetch');
require('dotenv').config({ path: '.env.local' });

// User's token from the log
const userToken = "eyJhbGciOiJFUzI1NiIsImtpZCI6ImI4MTI2OWYxLTIxZDgtNGYyZS1iNzE5LWMyMjQwYTg0MGQ5MCIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL2FwaS5pbnNwZWN0aGVyby5wbC9hdXRoL3YxIiwic3ViIjoiZjk4YTE2MTUtODMxNC00MTZmLWE1ZmYtYzEwOTJmNmFjYmViIiwiYXVkIjoiYXV0aGVudGljYXRlZCIsImV4cCI6MTc3NjcwMTg2MywiaWF0IjoxNzc2Njk4MjYzLCJlbWFpbCI6InNlYnJldHUzM0BnbWFpbC5jb20iLCJwaG9uZSI6IiIsImFwcF9tZXRhZGF0YSI6eyJwcm92aWRlciI6ImVtYWlsIiwicHJvdmlkZXJzIjpbImVtYWlsIl19LCJ1c2VyX21ldGFkYXRhIjp7ImNvbXBhbnlfaWQiOiI2NWQ4YjhkZi1iMGVkLTRiYWMtYWQ2ZC1lZjE0MDkyMTkyMDgiLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiZnVsbF9uYW1lIjoiTWFyY2luIFNsYXBpbnNraSJ9LCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDEiLCJhbXIiOlt7Im1ldGhvZCI6InBhc3N3b3JkIiwidGltZXN0YW1wIjoxNzc2Njg1ODQ4fV0sInNlc3Npb25faWQiOiI2NjUwOTZlOC1jYThlLTQ2NjktOTc5Yy04ZWM3NjM3MDU0MzciLCJpc19hbm9ueW1vdXMiOmZhbHNlfQ.QuyLVy6xSQdfEbBp11wnqrBNpYAl-iYyLGg21nEg4WANO8lcOcgDII1bvbqTwU1QCj-U5rJyMOIj_haaBPd60g";

async function testCalendarApi() {
    const url = 'http://localhost:3000/api/calendar'; // Since it's running locally
    console.log(`Testing Calendar API: ${url}`);

    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${userToken}`
            }
        });

        const data = await response.json();
        console.log('Status:', response.status);
        console.log('Response JSON:', JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error fetching calendar API:', error);
    }
}

testCalendarApi();
