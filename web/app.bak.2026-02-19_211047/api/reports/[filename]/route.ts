import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { createServerSupabaseClient, isAuthRequiredError } from "@/lib/supabaseServer";

const REPORTS_DIR = path.join(process.cwd(), "private_reports");

export async function GET(req: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
    try {
        const { userId } = createServerSupabaseClient(req);
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { filename } = await params;
        if (!filename) {
            return NextResponse.json({ error: "Missing filename" }, { status: 400 });
        }

        const safeName = path.basename(filename); // simple path traversal prevention
        const filePath = path.join(REPORTS_DIR, safeName);

        try {
            await fs.access(filePath);
        } catch {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        const fileBuffer = await fs.readFile(filePath);

        return new NextResponse(fileBuffer, {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="${safeName}"`
            }
        });
    } catch (error: any) {
        console.error("[API /reports/[filename]] Error downloading:", error);
        if (isAuthRequiredError(error)) {
            return NextResponse.json({ error: "Unauthorized - Bearer token required" }, { status: 401 });
        }
        return NextResponse.json(
            { error: error?.message || "Failed to download report" },
            { status: 500 }
        );
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
    try {
        const { userId } = createServerSupabaseClient(req);
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Optional: Check if user is admin? 
        // For now, allow any logged-in user to delete their reports or any reports visible in the list.
        // The list API currently returns ALL files in the directory.

        const { filename } = await params;
        if (!filename) {
            return NextResponse.json({ error: "Missing filename" }, { status: 400 });
        }

        const safeName = path.basename(filename);
        const filePath = path.join(REPORTS_DIR, safeName);

        try {
            await fs.unlink(filePath);
        } catch (e: any) {
            if (e.code === 'ENOENT') {
                return NextResponse.json({ error: "File not found" }, { status: 404 });
            }
            throw e;
        }

        return NextResponse.json({ ok: true });
    } catch (error: any) {
        console.error("[API /reports/[filename]] Error deleting:", error);
        if (isAuthRequiredError(error)) {
            return NextResponse.json({ error: "Unauthorized - Bearer token required" }, { status: 401 });
        }
        return NextResponse.json(
            { error: error?.message || "Failed to delete report" },
            { status: 500 }
        );
    }
}
