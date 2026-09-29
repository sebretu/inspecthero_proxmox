import fs from 'fs';
import readline from 'readline';

async function main() {
  const fileStream = fs.createReadStream('/home/ubuntu/.gemini/antigravity-ide/brain/1cda68e2-d5bb-4beb-9155-717bbaa297f6/.system_generated/logs/transcript.jsonl');

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let lineCount = 0;
  for await (const line of rl) {
    lineCount++;
    if (line.includes('stromkreise') || line.includes('633c788d-fe28-4f0d-97f1-87d2affe9021')) {
      console.log(`Line ${lineCount}: len ${line.length}`);
      // Parse JSON
      try {
        const obj = JSON.parse(line);
        console.log(`  Type: ${obj.type}, Source: ${obj.source}`);
        if (obj.content && obj.content.length < 5000) {
          console.log(`  Content: ${obj.content}`);
        } else if (obj.content) {
          console.log(`  Content (truncated): ${obj.content.slice(0, 1000)} ...`);
        }
        if (obj.tool_calls) {
          console.log(`  Tool calls:`, JSON.stringify(obj.tool_calls, null, 2).slice(0, 1000));
        }
        if (obj.output) {
          console.log(`  Output:`, typeof obj.output === 'string' ? obj.output.slice(0, 1000) : JSON.stringify(obj.output).slice(0, 1000));
        }
      } catch(e) {
        console.log(`  Non-JSON or parse error: ${line.slice(0, 200)}`);
      }
    }
  }
}
main();
