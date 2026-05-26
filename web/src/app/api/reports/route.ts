import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

import { createServerSupabaseClient } from "@/lib/supabaseServer";

export const dynamic = 'force-dynamic';

const REPORTS_DIR = path.join(process.cwd(), "private_reports");

// Ensure directory exists
if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

export async function GET(req: NextRequest) {
    try {
        const { userId } = createServerSupabaseClient(req);
        if (!userId) {
            return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }
        const files = fs.readdirSync(REPORTS_DIR).filter(f => f.endsWith(".pdf"));

        // Get stats for sorting
        const fileStats = files.map(file => {
            const filePath = path.join(REPORTS_DIR, file);
            const stats = fs.statSync(filePath);
            return {
                name: file,
                created_at: stats.birthtime,
                size: stats.size
            };
        });

        // Sort by newest first
        fileStats.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());

        return NextResponse.json({ ok: true, data: fileStats });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const { userId } = createServerSupabaseClient(req);
        if (!userId) {
            return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }
        const contentType = req.headers.get('content-type') || '';
        if (contentType.startsWith('multipart/form-data')) {
            // --- Handle FormData (file upload from iOS) ---
            // Use built-in req.formData() — correctly handles binary PDF bytes
            const formData = await req.formData();
            const file = formData.get('file') as File | null;
            const filenameFallback = formData.get('filename') as string | null;

            if (!file || file.size === 0) {
                return NextResponse.json({ ok: false, error: "Missing or empty file in FormData" }, { status: 400 });
            }

            const filename = file.name || filenameFallback || `report_${Date.now()}.pdf`;
            const safeName = filename.replace(/[^a-zA-Z0-9._-]+/g, "_");
            const filePath = path.join(REPORTS_DIR, safeName);

            const arrayBuffer = await file.arrayBuffer();
            fs.writeFileSync(filePath, Buffer.from(arrayBuffer));
            return NextResponse.json({ ok: true, message: "Saved (FormData)" });

        } else {
            // --- Handle JSON (base64) ---
            const body = await req.json();
            const { filename, base64 } = body;
            if (!filename || !base64) {
                return NextResponse.json({ ok: false, error: "Missing filename or base64" }, { status: 400 });
            }
            // Basic sanitization
            const safeName = filename.replace(/[^a-zA-Z0-9._-]+/g, "_");
            const filePath = path.join(REPORTS_DIR, safeName);
            // Write file
            const buffer = Buffer.from(base64, "base64");
            fs.writeFileSync(filePath, buffer);
            return NextResponse.json({ ok: true, message: "Saved" });
        }
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
    }
}
