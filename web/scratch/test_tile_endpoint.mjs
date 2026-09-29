async function main() {
  const url = "http://localhost:3005/api/tiles/0d4ccb3f-d8ab-4cce-bd74-fc15da3f510e/1/0/0.png?public=true";
  const res = await fetch(url);
  console.log("Tile request status:", res.status);
  console.log("Headers:");
  for (const [k, v] of res.headers.entries()) {
    console.log(`  ${k}: ${v}`);
  }
}
main();
