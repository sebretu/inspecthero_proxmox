import { createWorker } from "tesseract.js";
import path from "path";

async function testTesseractWorker() {
  console.log("=== TESTING TESSERACT WORKER PATHS ===");
  console.log("CWD:", process.cwd());

  try {
    const worker = await createWorker('deu+eng');
    console.log("Default createWorker SUCCESS!");
    await worker.terminate();
  } catch (err) {
    console.error("Default createWorker FAILED:", err);
  }
}

testTesseractWorker();
