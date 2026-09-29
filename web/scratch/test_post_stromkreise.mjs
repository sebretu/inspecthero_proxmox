import fetch from 'node-fetch';

const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmOThhMTYxNS04MzE0LTQxNmYtYTVmZi1jMTA5MmY2YWNiZWIiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzgxMTc0NTExLCJpYXQiOjE3ODExNzA5MTEsImVtYWlsIjoic2VicmV0dTMzQGdtYWlsLmNvbSIsInBob25lIjoiIiwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiZW1haWwiLCJwcm92aWRlcnMiOlsiZW1haWwiXX0sInVzZXJfbWV0YWRhdGEiOnsiY29tcGFueV9pZCI6IjY1ZDhiOGRmLWIwZWQtNGJhYy1hZDZkLWVmMTQwOTIxOTIwOCIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJmdWxsX25hbWUiOiJNYXJjaW4gU2xhcGluc2tpIn0sInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiYWFsIjoiYWFsMSIsImFtciI6W3sibWV0aG9kIjoicGFzc3dvcmQiLCJ0aW1lc3RhbXAiOjE3ODExNzA5MTF9XSwic2Vzc2lvbl9pZCI6ImJmNDA5NGI5LWQ4N2QtNDY0MC04NTJiLWRjYWNkZTBmMmJjYiIsImlzX2Fub255bW91cyI6ZmFsc2V9.oPkmR0dIPz4wmPBSmMgIs3IIsO5-_98xgRM1x4pQAaQ";

const payload = {
    project_id: "45558114-382e-4e5c-a277-2d5532c71f58",
    plan_id: "990da539-ab71-42da-a501-45bf840a8d99",
    circuit_code: "Strzałka",
    short_label: "Strzałka",
    full_name: "Strzałka",
    type: "line",
    marker_shape: "circle",
    x_norm: 0.5,
    y_norm: 0.5,
    metadata: { x2_norm: 0.6, y2_norm: 0.6, realType: "arrow" }
};

async function main() {
    const res = await fetch('http://127.0.0.1:3005/api/stromkreise', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'X-App-Token': token
        },
        body: JSON.stringify(payload)
    });
    const json = await res.json();
    console.log("Status:", res.status);
    console.log("Response:", json);
}

main();
