const { createClient } = require("@supabase/supabase-js");
const { PDFDocument } = require("pdf-lib");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(url, key);

async function run() {
  try {
    console.log("Fetching plans...");
    const { data: plans, error } = await supabase
      .from("plans")
      .select("id, pdf_path, storage_path, storage_bucket, version")
      .order("created_at", { ascending: false })
      .limit(3);

    if (error) throw error;

    for (const plan of plans) {
      const path = plan.storage_path || plan.pdf_path;
      const bucket = plan.storage_bucket || "plans";
      console.log(`\nPlan ID: ${plan.id}, Path: ${path}, Bucket: ${bucket}`);
      
      const { data, error: dlError } = await supabase.storage.from(bucket).download(path);
      if (dlError) {
        console.log(`Failed to download PDF: ${dlError.message}`);
        continue;
      }

      const pdfBytes = await data.arrayBuffer();
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const page = pdfDoc.getPages()[0];
      const mediaBox = page.getMediaBox();
      const cropBox = page.getCropBox();
      const size = page.getSize();
      const rotation = page.getRotation().angle || 0;

      console.log("PDF GEOMETRY:");
      console.log(`  Rotation: ${rotation}`);
      console.log(`  Size: width=${size.width}, height=${size.height}`);
      console.log(`  MediaBox: x=${mediaBox.x}, y=${mediaBox.y}, w=${mediaBox.width}, h=${mediaBox.height}`);
      console.log(`  CropBox: x=${cropBox.x}, y=${cropBox.y}, w=${cropBox.width}, h=${cropBox.height}`);
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
