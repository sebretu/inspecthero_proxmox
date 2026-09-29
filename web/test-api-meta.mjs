import fetch from 'node-fetch';
async function run() {
  const metaRes = await fetch("http://localhost:3005/api/tiles/633c788d-fe28-4f0d-97f1-87d2affe9021/meta");
  console.log(await metaRes.text());
}
run();
