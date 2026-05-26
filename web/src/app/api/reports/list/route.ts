import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { createServerSupabaseClient } from "@/lib/supabaseServer";

const REPORTS_DIR = path.join(process.cwd(), "private_reports");

export async function GET(req: NextRequest) {
    try {
        // Authenticate user
        const { userId } = createServerSupabaseClient(req);
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Ensure directory exists
        try {
            await fs.access(REPORTS_DIR);
        } catch {
            // Directory doesn't exist, return empty array
            return NextResponse.json([]);
        }

        // Read all files from directory
        const files = await fs.readdir(REPORTS_DIR);

        // Filter for PDF files only
        const pdfFiles = files.filter(f => f.endsWith(".pdf"));

        // Get file stats for each PDF
        const reportsPromises = pdfFiles.map(async (filename) => {
            const filePath = path.join(REPORTS_DIR, filename);
            const stats = await fs.stat(filePath);

            return {
                filename,
                createdAt: stats.birthtime.toISOString(),
                size: stats.size,
            };
        });

        const reports = await Promise.all(reportsPromises);

        // Sort by creation time (newest first)
        reports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        return NextResponse.json({ ok: true, data: reports });
    } catch (error) {
        console.error("[API /reports/list] Error:", error);
        return NextResponse.json(
            { error: "Failed to list reports" },
            { status: 500 }
        );
    }
}
