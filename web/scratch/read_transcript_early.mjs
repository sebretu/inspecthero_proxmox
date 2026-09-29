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
    if (lineCount >= 2300) continue; // Skip recent lines we just generated
    
    // We are looking for logs of stromkreise queries or contents
    if (line.includes('stromkreise') && (line.includes('x_norm') || line.includes('x"') || line.includes('y_norm') || line.includes('[{') || line.includes('rows:'))) {
      console.log(`Line ${lineCount}: len ${line.length}`);
      try {
        const obj = JSON.parse(line);
        console.log(`  Type: ${obj.type}, Source: ${obj.source}`);
        const text = obj.content || obj.output || '';
        if (typeof text === 'string') {
          console.log(`  Preview: ${text.slice(0, 1000)}`);
        } else {
          console.log(`  Preview (JSON): ${JSON.stringify(text).slice(0, 1000)}`);
        }
      } catch(e) {
        console.log(`  Parse error or non-JSON`);
      }
    }
  }
}
main();
