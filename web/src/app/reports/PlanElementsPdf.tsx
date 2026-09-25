import React from 'react';
import {
    Page, Text, View, Document, StyleSheet, Image, Font, Link,
    Svg, Rect, Circle, Line, Path, G, Text as SvgText
} from '@react-pdf/renderer';
import { BMA_ICONS_BASE64, getPiktoDirection, getPiktoBase64 } from '@/lib/bmaSymbolsData';

Font.register({
    family: 'Roboto',
    fonts: [
        {
            src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-regular-webfont.ttf',
            fontWeight: 'normal',
        },
        {
            src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-bold-webfont.ttf',
            fontWeight: 'bold',
        },
    ],
});

// A0 Landscape in points (3370.39 x 2383.94)
const PAGE_W = 3370;
const PAGE_H = 2384;
const PADDING = 14;
const HEADER_H = 38;
const CONTAINER_W = PAGE_W - (PADDING * 2);
const CONTAINER_H = PAGE_H - (PADDING * 2) - HEADER_H - 8;

// Marker sizes scaled for A0
const BMA_SIZE = 23;
const PIN_R = 10;
const PIN_FONT = 9;
const RK_STROKE = 2.5;
const MEAS_STROKE = 1.5;

const COLORS = {
    dis: '#dc2626',
    detector_blue: '#2563eb',
    detector_red: '#dc2626',
    klappen: '#d97706',
    meas: '#7c3aed',
    pin: '#059669',
};

const styles = StyleSheet.create({
    page: {
        width: PAGE_W,
        height: PAGE_H,
        padding: PADDING,
        fontFamily: 'Roboto',
        backgroundColor: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
    },
    header: {
        height: HEADER_H,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#0f172a',
        paddingHorizontal: 16,
        marginBottom: 8,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    headerProject: {
        fontSize: 14,
        color: '#94a3b8',
    },
    headerProjectName: {
        fontSize: 15,
        fontWeight: 'bold',
        color: '#ffffff',
    },
    headerDivider: {
        fontSize: 14,
        color: '#475569',
    },
    headerPlan: {
        fontSize: 15,
        fontWeight: 'bold',
        color: '#38bdf8',
    },
    headerBadges: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    badge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderWidth: 1,
    },
    badgeText: {
        fontSize: 12,
        fontWeight: 'bold',
    },
    container: {
        width: CONTAINER_W,
        height: CONTAINER_H,
        position: 'relative',
        backgroundColor: '#ffffff',
        overflow: 'hidden',
    },
});

export type ExportPlanData = {
    planId: string;
    planName: string;
    buildingName?: string;
    floorName?: string;
    imageBase64?: string | null;
    imageWidth?: number;
    imageHeight?: number;
    gridWidth?: number;
    gridHeight?: number;
    pixelsPerMeter?: number | null;
    measurements: Array<{
        id: string;
        points: Array<{ x_norm: number; y_norm: number }>;
        distanceMeters?: number | null;
        totalDistanceMeters?: number | null;
        segments?: Array<{ distMeters?: number | null; distPx?: number }>;
        label?: string | null;
    }>;
    klappen: Array<{
        id: string;
        x_norm: number;
        y_norm: number;
        w_norm: number;
        h_norm: number;
        width_cm?: number | null;
        height_cm?: number | null;
        label?: string | null;
        description?: string | null;
    }>;
    bmaSymbols: Array<{
        id: string;
        symbol_type: string;
        x_norm: number;
        y_norm: number;
        label?: string | null;
        loop_number?: string | null;
        address?: string | null;
        description?: string | null;
    }>;
    photoPins: Array<{
        id: string;
        x_norm: number;
        y_norm: number;
        description?: string | null;
        photo_url?: string | null;
        photoBase64?: string | null;
        created_at?: string;
        user_name?: string;
        pin_type?: string;
    }>;
    montagePins?: Array<{
        id: string;
        x_norm: number;
        y_norm: number;
        description?: string | null;
        photo_url?: string | null;
        photoBase64?: string | null;
        created_at?: string;
        user_name?: string;
    }>;
    damagePins?: Array<{
        id: string;
        x_norm: number;
        y_norm: number;
        description?: string | null;
        photo_url?: string | null;
        photoBase64?: string | null;
        created_at?: string;
        user_name?: string;
    }>;
    lampTypes?: {
        notlicht_lampe?: { model?: string; photoBase64?: string; photoUrl?: string; notes?: string };
        notlicht_pikto?: { model?: string; photoBase64?: string; photoUrl?: string; notes?: string };
        notlicht_pikto_gross?: { model?: string; photoBase64?: string; photoUrl?: string; notes?: string };
        variants?: Array<{
            id: string;
            name: string;
            color: string;
            model?: string;
            category?: string;
            photoBase64?: string;
            notes?: string;
        }>;
        [key: string]: any;
    };
    cableConnections?: Array<{
        id: string;
        name?: string;
        type?: string;
        color?: string;
        source_symbol_id?: string;
        target_symbol_id?: string;
        metadata?: {
            cable_number?: string;
            cable_type?: string;
            description?: string;
            length_meters?: number;
            is_free_line?: boolean;
            waypoints?: Array<{ x_norm: number; y_norm: number }>;
            [key: string]: any;
        };
        [key: string]: any;
    }>;
};

export type PlanElementsPdfProps = {
    projectName: string;
    plansData: ExportPlanData[];
    options: {
        includeMeasurements?: boolean;
        includeKlappen?: boolean;
        includeAbdeckung?: boolean;
        includeAnderungen?: boolean;
        includeBma?: boolean;
        includeNotlicht?: boolean;
        includeLighting?: boolean;
        includeHeating?: boolean;
        includeKabelbahn?: boolean;
        includeKabelauslass?: boolean;
        includeCables?: boolean;
    includeFreeLines?: boolean;
    includeKabelzugliste?: boolean;
    schemaBackground?: 'grundriss' | 'white';
        includePhotoPins?: boolean;
        includeMontageDoku?: boolean;
        includeDamage?: boolean;
        includePlanOverview?: boolean;
        reservePerKreis?: number;
        includeLampTypes?: boolean;
        kabelhinweisText?: string;
        onlyKabelzugliste?: boolean;
    };
    translations: {
        title: string;
        project: string;
        plan?: string;
        generatedOn: string;
        page: string;
        of: string;
        measurementsTitle: string;
        klappenTitle: string;
        bmaTitle?: string;
        dMelder?: string;
        zwdMelder?: string;
        disSignalgeber?: string;
        sirene?: string;
        notlichtLampe?: string;
        notlichtPikto?: string;
        photoPinsTitle: string;
        montageDokuTitle?: string;
        totalLength: string;
        dimensions: string;
        loopAddress: string;
        label: string;
        description: string;
        date: string;
        author: string;
        noData: string;
        planOverview: string;
    };
};

function formatSegText(distM?: number | null, distPx?: number): string | null {
    if (distM != null && !isNaN(distM) && distM > 0) {
        return distM >= 1 ? `${distM.toFixed(2)} m` : `${(distM * 100).toFixed(0)} cm`;
    }
    if (distPx != null && !isNaN(distPx) && distPx > 0) {
        return `${Math.round(distPx)} px`;
    }
    return null;
}

// Helper to calculate true connection point of any symbol for PDF (4-side edge midpoint for geraet_box, edge for point markers)
function getPdfSymbolConnectionPoint(s: any, otherPt?: { x_norm: number; y_norm: number }, imgW?: number, imgH?: number): { x_norm: number; y_norm: number } | null {
    if (!s) return null;
    if (s.symbol_type === 'geraet_box') {
        let w_norm = 0.015;
        let h_norm = 0.006;
        try {
            const pObj = JSON.parse(s.description || '{}');
            const scale = typeof pObj.scale === 'number' ? pObj.scale : (pObj.isSmall || pObj.geraetSize === 'small' ? 0.5 : 1.0);
            const isSenkrecht = pObj.orientation === 'senkrecht' || pObj.direction === 'senkrecht' || pObj.direction === 'down' || pObj.direction === 'up';
            if (typeof pObj.w_norm === 'number' && typeof pObj.h_norm === 'number') {
                w_norm = pObj.w_norm;
                h_norm = pObj.h_norm;
            } else if (isSenkrecht) {
                w_norm = 0.0036 * scale;
                h_norm = 0.025 * scale;
            } else {
                w_norm = 0.015 * scale;
                h_norm = 0.006 * scale;
            }
        } catch {}

        const cx = s.x_norm + w_norm / 2;
        const cy = s.y_norm + h_norm / 2;
        const x_min = s.x_norm;
        const x_max = s.x_norm + w_norm;
        const y_min = s.y_norm;
        const y_max = s.y_norm + h_norm;

        if (!otherPt) return { x_norm: cx, y_norm: cy };

        const dx = otherPt.x_norm - cx;
        const dy = otherPt.y_norm - cy;

        if (Math.abs(dx) > Math.abs(dy)) {
            return { x_norm: dx > 0 ? x_max : x_min, y_norm: cy };
        } else {
            return { x_norm: cx, y_norm: dy > 0 ? y_max : y_min };
        }
    }

    if (otherPt) {
        const dx = otherPt.x_norm - s.x_norm;
        const dy = otherPt.y_norm - s.y_norm;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0.0001) {
            // Match exact rendered visual icon dimensions + 3px ring border padding on PDF canvas
            const refW = imgW || 3000;
            const refH = imgH || 2000;
            let iconHalfW = 8;
            let iconHalfH = 8;

            const isInfraSenkrecht = (() => {
                if (s.symbol_type !== 'infrarotheizung') return false;
                try {
                    const pObj = JSON.parse(s.description || '{}');
                    return pObj.orientation === 'senkrecht' || pObj.direction === 'senkrecht' || pObj.direction === 'down' || pObj.direction === 'up';
                } catch { return false; }
            })();

            if (s.symbol_type === 'infrarotheizung') {
                iconHalfW = isInfraSenkrecht ? (20 / 2 + 3) : (60 / 2 + 3); // 13px senkrecht, 33px waagerecht
                iconHalfH = isInfraSenkrecht ? (60 / 2 + 3) : (20 / 2 + 3); // 33px senkrecht, 13px waagerecht
            } else if (s.symbol_type === 'warmepumpe_aussen') {
                iconHalfW = 30 / 2 + 3; // 18px
                iconHalfH = 60 / 2 + 3; // 33px
            } else if (s.symbol_type === 'warmepumpe_innen') {
                iconHalfW = 45 / 2 + 3; // 25.5px
                iconHalfH = 45 / 2 + 3; // 25.5px
            } else if (s.symbol_type === 'temperaturfuehler') {
                iconHalfW = 32 / 2 + 3; // 19px
                iconHalfH = 32 / 2 + 3; // 19px
            } else if (s.symbol_type === 'notlicht_pikto_gross') {
                iconHalfW = 26 / 2 + 3; // 16px
                iconHalfH = 13 / 2 + 3; // 9.5px
            } else if (s.symbol_type === 'dis_signalgeber' || s.symbol_type === 'sirene') {
                iconHalfW = 18 / 2 + 3; // 12px
                iconHalfH = 14 / 2 + 3; // 10px
            }

            const rNormX = iconHalfW / refW;
            const rNormY = iconHalfH / refH;

            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);
            if (absDx > absDy) {
                const exitX = s.x_norm + (dx > 0 ? rNormX : -rNormX);
                return { x_norm: exitX, y_norm: s.y_norm };
            } else {
                const exitY = s.y_norm + (dy > 0 ? rNormY : -rNormY);
                return { x_norm: s.x_norm, y_norm: exitY };
            }
        }
    }

    return { x_norm: s.x_norm, y_norm: s.y_norm };
}
const getPdfSymbolCenter = getPdfSymbolConnectionPoint;


function generateRevisionCloudPath(x: number, y: number, w: number, h: number): string {
    const arcSize = 10;
    const bulge = 3.5;
    let path = `M ${x} ${y}`;

    // Top edge (left to right)
    const topSteps = Math.max(2, Math.round(w / arcSize));
    const dxTop = w / topSteps;
    for (let i = 0; i < topSteps; i++) {
        const x1 = x + i * dxTop;
        const x2 = x + (i + 1) * dxTop;
        const cx = (x1 + x2) / 2;
        const cy = y - bulge;
        path += ` Q ${cx} ${cy} ${x2} ${y}`;
    }

    // Right edge (top to bottom)
    const rightSteps = Math.max(2, Math.round(h / arcSize));
    const dyRight = h / rightSteps;
    for (let i = 0; i < rightSteps; i++) {
        const y1 = y + i * dyRight;
        const y2 = y + (i + 1) * dyRight;
        const cx = x + w + bulge;
        const cy = (y1 + y2) / 2;
        path += ` Q ${cx} ${cy} ${x + w} ${y2}`;
    }

    // Bottom edge (right to left)
    const bottomSteps = Math.max(2, Math.round(w / arcSize));
    const dxBottom = w / bottomSteps;
    for (let i = 0; i < bottomSteps; i++) {
        const x1 = x + w - i * dxBottom;
        const x2 = x + w - (i + 1) * dxBottom;
        const cx = (x1 + x2) / 2;
        const cy = y + h + bulge;
        path += ` Q ${cx} ${cy} ${x2} ${y + h}`;
    }

    // Left edge (bottom to top)
    const leftSteps = Math.max(2, Math.round(h / arcSize));
    const dyLeft = h / leftSteps;
    for (let i = 0; i < leftSteps; i++) {
        const y1 = y + h - i * dyLeft;
        const y2 = y + h - (i + 1) * dyLeft;
        const cx = x - bulge;
        const cy = (y1 + y2) / 2;
        path += ` Q ${cx} ${cy} ${x} ${y2}`;
    }

    path += ' Z';
    return path;
}


function isSymbolIncluded(symbolType: string, options: PlanElementsPdfProps['options']): boolean {
    if (symbolType === 'abdeckung_box') {
        if (options.includeAbdeckung !== undefined) return !!options.includeAbdeckung;
        return true;
    }
    if (symbolType === 'revision_cloud') {
        if (options.includeAnderungen !== undefined) return !!options.includeAnderungen;
        return true;
    }
    const isEmergency = symbolType === 'notlicht_lampe' || symbolType === 'notlicht_pikto' || symbolType === 'notlicht_pikto_gross';
    const isBma = symbolType === 'detector_red' || symbolType === 'detector_blue' || symbolType === 'dis_signalgeber' || symbolType === 'sirene';
    const isKabelbahn = symbolType === 'kabelbahn';
    const isKabelauslass = symbolType === 'kabelauslass' || symbolType === 'ueberspannungsschutz';
    const isLighting = symbolType === 'lampe' || symbolType === 'led_stripe';
    const isHeating = symbolType === 'warmepumpe_aussen' || symbolType === 'warmepumpe_innen' || symbolType === 'infrarotheizung' || symbolType === 'geraet_box' || symbolType === 'temperaturfuehler' || symbolType === 'ueberspannungsschutz';

    if (isEmergency) {
        if (options.includeNotlicht !== undefined) return !!options.includeNotlicht;
        return !!options.includeBma;
    }
    if (isBma) {
        if (options.includeBma !== undefined) return !!options.includeBma;
        return true;
    }
    if (isHeating) {
        if (options.includeHeating !== undefined) return !!options.includeHeating;
        if (options.includeLighting !== undefined) return !!options.includeLighting;
        return !!options.includeBma;
    }
    if (isKabelbahn) {
        if (options.includeKabelbahn !== undefined) return !!options.includeKabelbahn;
        if (options.includeLighting !== undefined) return !!options.includeLighting;
        return !!options.includeBma;
    }
    if (isKabelauslass) {
        if (options.includeKabelauslass !== undefined) return !!options.includeKabelauslass;
        if (options.includeLighting !== undefined) return !!options.includeLighting;
        return !!options.includeBma;
    }
    if (isLighting) {
        if (options.includeLighting !== undefined) return !!options.includeLighting;
        return !!options.includeBma;
    }
    return !!options.includeBma;
}

type DeconflictedLabel = {
    symbolId: string;
    symbol_type: string;
    text: string;
    badgeX: number;
    badgeY: number;
    badgeW: number;
    badgeH: number;
    textX: number;
    textY: number;
    iconCenterX: number;
    iconCenterY: number;
    hasLeaderLine: boolean;
    isEmergency: boolean;
    variantColor?: string | null;
    variantName?: string | null;
    variantModel?: string | null;
};

export function splitRevisionCloudText(header: string, desc: string, maxCharsPerLine = 55): [string, string] {
    const cleanHeader = (header || 'Hinweis').trim();
    const cleanDesc = (desc || '').trim();
    if (!cleanDesc) {
        return [cleanHeader, ''];
    }
    const full = `${cleanHeader}: ${cleanDesc}`;
    if (full.length <= maxCharsPerLine) {
        if (cleanDesc.length > 20) {
            return [`${cleanHeader}:`, cleanDesc];
        }
        return [full, ''];
    }
    const words = full.split(/\s+/);
    const halfLen = Math.floor(full.length / 2);
    let curLen = 0;
    let splitAtIdx = -1;
    for (let i = 0; i < words.length; i++) {
        curLen += words[i].length + (i > 0 ? 1 : 0);
        if (curLen >= halfLen && splitAtIdx === -1) {
            splitAtIdx = i;
            break;
        }
    }
    if (splitAtIdx === -1) splitAtIdx = Math.floor(words.length / 2);
    const line1 = words.slice(0, splitAtIdx + 1).join(' ');
    const line2 = words.slice(splitAtIdx + 1).join(' ');
    return [line1, line2];
}

export function getSymbolCategoryColor(symbol_type: string, variantColor?: string | null): string {
    if (variantColor) return variantColor;
    if (symbol_type === 'notlicht_lampe') return '#16a34a';
    if (symbol_type === 'notlicht_pikto') return '#15803d';
    if (symbol_type === 'notlicht_pikto_gross') return '#047857';
    if (symbol_type === 'warmepumpe_aussen') return '#0284c7';
    if (symbol_type === 'warmepumpe_innen') return '#0ea5e9';
    if (symbol_type === 'infrarotheizung') return '#ea580c';
    if (symbol_type === 'geraet_box') return '#0284c7';
    if (symbol_type === 'detector_red') return '#ef4444';
    if (symbol_type === 'detector_blue') return '#3b82f6';
    if (symbol_type === 'dis_signalgeber') return '#dc2626';
    if (symbol_type === 'sirene') return '#dc2626';
    if (symbol_type === 'revision_cloud') return '#dc2626';
    return '#64748b';
}

function computeDeconflictedLabels(
    symbols: Array<{
        id: string;
        symbol_type: string;
        x_norm: number;
        y_norm: number;
        label?: string | null;
        description?: string | null;
    }>,
    mapX: (x: number) => number,
    mapY: (y: number) => number,
    lampVariants?: any[]
): DeconflictedLabel[] {
    type Box = { x: number; y: number; w: number; h: number; symbolId?: string };

    const validSymbols = symbols.filter(
        s => s.symbol_type !== 'revision_cloud' && s.symbol_type !== 'kabelbahn' && s.symbol_type !== 'abdeckung_box'
    );

    // 1. Collect protected icon bounding boxes
    const iconBoxes: Box[] = validSymbols.map(s => {
        const cx = mapX(s.x_norm);
        const cy = mapY(s.y_norm);
        const isGross = s.symbol_type === 'notlicht_pikto_gross';
        const isDis = s.symbol_type === 'dis_signalgeber';
        const isWpAussen = s.symbol_type === 'warmepumpe_aussen';
        const isWpInnen = s.symbol_type === 'warmepumpe_innen';
        const isInfra = s.symbol_type === 'infrarotheizung';
        const isFuehler = s.symbol_type === 'temperaturfuehler';
        const iconW = isGross ? 26 : isDis ? 34 : isWpAussen ? 30 : isWpInnen ? 45 : isFuehler ? 32 : isInfra ? 60 : BMA_SIZE;
        const iconH = isGross ? 13 : isDis ? 22 : isWpAussen ? 60 : isWpInnen ? 45 : isFuehler ? 32 : isInfra ? 20 : BMA_SIZE;
        return {
            symbolId: s.id,
            x: cx - iconW / 2 - 2,
            y: cy - iconH / 2 - 2,
            w: iconW + 4,
            h: iconH + 4,
        };
    });

    const placedBoxes: Box[] = [...iconBoxes];
    const results: DeconflictedLabel[] = [];

    const intersects = (a: Box, b: Box, pad = 2): boolean => {
        return !(
            a.x + a.w + pad < b.x ||
            b.x + b.w + pad < a.x ||
            a.y + a.h + pad < b.y ||
            b.y + b.h + pad < a.y
        );
    };

    for (const s of validSymbols) {
        if (!s.label || !s.label.trim()) continue;
        let text = s.label.trim();
        const cx = mapX(s.x_norm);
        const cy = mapY(s.y_norm);
        const isGross = s.symbol_type === 'notlicht_pikto_gross';
        const isDis = s.symbol_type === 'dis_signalgeber';
        const isBmaDetector = s.symbol_type === 'detector_red' || s.symbol_type === 'detector_blue' || s.symbol_type === 'dis_signalgeber' || s.symbol_type === 'sirene';
        const isEmergency = s.symbol_type === 'notlicht_lampe' || s.symbol_type === 'notlicht_pikto' || s.symbol_type === 'notlicht_pikto_gross';
        const isWpAussen = s.symbol_type === 'warmepumpe_aussen';
        const isWpInnen = s.symbol_type === 'warmepumpe_innen';
        const isInfra = s.symbol_type === 'infrarotheizung';
        const isFuehler = s.symbol_type === 'temperaturfuehler';
        const isInfraSenkrecht = (() => {
            try {
                const pObj = JSON.parse(s.description || '{}');
                return pObj.orientation === 'senkrecht' || pObj.direction === 'senkrecht' || pObj.direction === 'down' || pObj.direction === 'up';
            } catch { return false; }
        })();
        const iconW = isGross ? 26 : isDis ? 34 : isWpAussen ? 30 : isWpInnen ? 45 : isFuehler ? 32 : isInfra ? (isInfraSenkrecht ? 20 : 60) : BMA_SIZE;
        const iconH = isGross ? 13 : isDis ? 22 : isWpAussen ? 60 : isWpInnen ? 45 : isFuehler ? 32 : isInfra ? (isInfraSenkrecht ? 60 : 20) : BMA_SIZE;

        let variantColor: string | null = null;
        let variantName: string | null = null;
        let variantModel: string | null = null;
        let powerKw: string | null = null;
        let zuleitung: string | null = null;
        if (s.description) {
            try {
                const parsed = JSON.parse(s.description);
                if (parsed.powerKw) powerKw = parsed.powerKw;
                if (lampVariants && lampVariants.length > 0) {
                    const isHeating = s.symbol_type === 'warmepumpe_aussen' || s.symbol_type === 'warmepumpe_innen' || s.symbol_type === 'infrarotheizung' || s.symbol_type === 'geraet_box';
                    const found = lampVariants.find((v: any) => {
                        const vIsHeating = v.category === 'warmepumpe_aussen' || v.category === 'warmepumpe_innen' || v.category === 'infrarotheizung' || v.category === 'geraet_box';
                        if (isHeating !== vIsHeating) return false;
                        if (v.category && v.category !== s.symbol_type && !(v.category === 'geraet_box' && s.symbol_type === 'geraet_box')) return false;
                        if (parsed.variantId && v.id === parsed.variantId) return true;
                        if (parsed.variantName && v.name === parsed.variantName) return true;
                        return false;
                    });
                    if (found) {
                        if (found.color) variantColor = found.color;
                        if (found.name) variantName = found.name;
                        if (found.model) variantModel = found.model;
                    }
                }
                if (!variantColor && parsed.variantColor && parsed.variantId) variantColor = parsed.variantColor;
                if (!variantName && parsed.variantName && parsed.variantId) variantName = parsed.variantName;
                if (!variantModel && parsed.variantModel) variantModel = parsed.variantModel;
            } catch {}
        }

        if (powerKw) {
            const kwStr = powerKw.includes('kW') ? powerKw : `${powerKw} kW`;
            text = `${text} (${kwStr})`;
        }

        const badgeW = isBmaDetector ? Math.max(34, text.length * 10.5 + 8) : Math.max(34, text.length * 11 + 10);
        const badgeH = isBmaDetector ? 18 : 18;

        // Candidate placement positions in order of priority
        const candidates: Array<{ box: Box; isFar: boolean }> = [];
        const stepDistances = [
            { dX: iconW / 2 + 4, dY: iconH / 2 + 2 },
            { dX: iconW / 2 + 14, dY: iconH / 2 + 16 },
            { dX: iconW / 2 + 28, dY: iconH / 2 + 30 },
        ];

        for (let sIdx = 0; sIdx < stepDistances.length; sIdx++) {
            const { dX, dY } = stepDistances[sIdx];
            const isFar = sIdx > 0;

            if (isBmaDetector) {
                // For BMA detectors (red & blue), place directly ABOVE icon (matching map preview)!
                candidates.push({ box: { x: cx - badgeW / 2, y: cy - iconH / 2 - badgeH - 2 - (sIdx * 6), w: badgeW, h: badgeH }, isFar });
                candidates.push({ box: { x: cx - badgeW + 8 - (sIdx * 6), y: cy - iconH / 2 - badgeH - 2 - (sIdx * 6), w: badgeW, h: badgeH }, isFar });
                candidates.push({ box: { x: cx - 8 + (sIdx * 6), y: cy - iconH / 2 - badgeH - 2 - (sIdx * 6), w: badgeW, h: badgeH }, isFar });
                candidates.push({ box: { x: cx - dX - badgeW, y: cy - badgeH / 2, w: badgeW, h: badgeH }, isFar });
                candidates.push({ box: { x: cx + dX, y: cy - badgeH / 2, w: badgeW, h: badgeH }, isFar });
                candidates.push({ box: { x: cx - badgeW / 2, y: cy + dY, w: badgeW, h: badgeH }, isFar });
            } else if (isInfra && isInfraSenkrecht) {
                // For vertical panels, prefer directly ABOVE icon first!
                candidates.push({ box: { x: cx - badgeW / 2, y: cy - dY - badgeH, w: badgeW, h: badgeH }, isFar });
                candidates.push({ box: { x: cx + dX, y: cy - badgeH / 2, w: badgeW, h: badgeH }, isFar });
                candidates.push({ box: { x: cx - dX - badgeW, y: cy - badgeH / 2, w: badgeW, h: badgeH }, isFar });
                candidates.push({ box: { x: cx - badgeW / 2, y: cy + dY, w: badgeW, h: badgeH }, isFar });
            } else {
                // 1. Below icon (default preferred position for horizontal icons)
                candidates.push({ box: { x: cx - badgeW / 2, y: cy + dY, w: badgeW, h: badgeH }, isFar });
                // 2. Above icon
                candidates.push({ box: { x: cx - badgeW / 2, y: cy - dY - badgeH, w: badgeW, h: badgeH }, isFar });
                // 3. Right of icon
                candidates.push({ box: { x: cx + dX, y: cy - badgeH / 2, w: badgeW, h: badgeH }, isFar });
                // 4. Left of icon
                candidates.push({ box: { x: cx - dX - badgeW, y: cy - badgeH / 2, w: badgeW, h: badgeH }, isFar });
            }
            // 5. Bottom-Right
            candidates.push({ box: { x: cx + dX, y: cy + dY, w: badgeW, h: badgeH }, isFar });
            // 6. Bottom-Left
            candidates.push({ box: { x: cx - dX - badgeW, y: cy + dY, w: badgeW, h: badgeH }, isFar });
            // 7. Top-Right
            candidates.push({ box: { x: cx + dX, y: cy - dY - badgeH, w: badgeW, h: badgeH }, isFar });
            // 8. Top-Left
            candidates.push({ box: { x: cx - dX - badgeW, y: cy - dY - badgeH, w: badgeW, h: badgeH }, isFar });
        }

        // Find first non-colliding candidate (ignoring this symbol's own iconBox)
        let chosenBox = candidates[0].box;
        let chosenIsFar = false;
        let foundClear = false;

        for (const cand of candidates) {
            let collides = false;
            for (const pb of placedBoxes) {
                if (pb.symbolId === s.id) continue;
                if (intersects(cand.box, pb, 2)) {
                    collides = true;
                    break;
                }
            }
            if (!collides) {
                chosenBox = cand.box;
                chosenIsFar = isBmaDetector ? false : cand.isFar;
                foundClear = true;
                break;
            }
        }

        if (!foundClear) {
            // Find candidate with minimal collision overlap
            let minOverlap = Infinity;
            for (const cand of candidates) {
                let overlapScore = 0;
                for (const pb of placedBoxes) {
                    if (pb.symbolId === s.id) continue;
                    if (intersects(cand.box, pb, 0)) {
                        const overlapX = Math.max(0, Math.min(cand.box.x + cand.box.w, pb.x + pb.w) - Math.max(cand.box.x, pb.x));
                        const overlapY = Math.max(0, Math.min(cand.box.y + cand.box.h, pb.y + pb.h) - Math.max(cand.box.y, pb.y));
                        overlapScore += overlapX * overlapY;
                    }
                }
                if (overlapScore < minOverlap) {
                    minOverlap = overlapScore;
                    chosenBox = cand.box;
                    chosenIsFar = isBmaDetector ? false : cand.isFar;
                }
            }
        }

        placedBoxes.push({ ...chosenBox, symbolId: s.id });

        results.push({
            symbolId: s.id,
            symbol_type: s.symbol_type,
            text,
            badgeX: Math.round(chosenBox.x),
            badgeY: Math.round(chosenBox.y),
            badgeW: Math.round(chosenBox.w),
            badgeH: Math.round(chosenBox.h),
            textX: Math.round(chosenBox.x + chosenBox.w / 2),
            textY: Math.round(chosenBox.y + chosenBox.h - (isBmaDetector ? 2.5 : 3.5)),
            iconCenterX: Math.round(cx),
            iconCenterY: Math.round(cy),
            hasLeaderLine: isBmaDetector ? false : chosenIsFar,
            isEmergency,
            variantColor,
            variantName,
            variantModel,
        });
    }

    return results;
}

export function makeStrictOrthoPolyline(
    pts: Array<{ x_norm: number; y_norm: number }>,
    s1?: any,
    s2?: any
): Array<{ x_norm: number; y_norm: number }> {
    if (pts.length < 2) return pts;

    const result: Array<{ x_norm: number; y_norm: number }> = [pts[0]];

    for (let i = 0; i < pts.length - 1; i++) {
        const pA = result[result.length - 1];
        const pB = pts[i + 1];

        const dx = pB.x_norm - pA.x_norm;
        const dy = pB.y_norm - pA.y_norm;

        if (Math.abs(dx) < 0.0001 || Math.abs(dy) < 0.0001) {
            result.push(pB);
            continue;
        }

        let corner: { x_norm: number; y_norm: number };

        if (i === pts.length - 2 && s2) {
            if (s2.symbol_type === 'geraet_box') {
                const isSenkrecht = (() => {
                    try {
                        const pObj = JSON.parse(s2.description || '{}');
                        return pObj.orientation === 'senkrecht' || pObj.direction === 'senkrecht' || pObj.direction === 'down' || pObj.direction === 'up';
                    } catch { return false; }
                })();
                const w_norm = isSenkrecht ? 0.0036 : 0.015;
                const h_norm = isSenkrecht ? 0.025 : 0.006;
                const cx = s2.x_norm + w_norm / 2;
                const cy = s2.y_norm + h_norm / 2;

                const isLeftRightEdge = Math.abs(pA.x_norm - cx) > Math.abs(pA.y_norm - cy);
                if (isLeftRightEdge) {
                    corner = { x_norm: pA.x_norm, y_norm: pB.y_norm };
                } else {
                    corner = { x_norm: pB.x_norm, y_norm: pA.y_norm };
                }
            } else {
                corner = Math.abs(dx) >= Math.abs(dy)
                    ? { x_norm: pB.x_norm, y_norm: pA.y_norm }
                    : { x_norm: pA.x_norm, y_norm: pB.y_norm };
            }
        } else if (i === 0 && s1) {
            if (s1.symbol_type === 'geraet_box') {
                const isSenkrecht = (() => {
                    try {
                        const pObj = JSON.parse(s1.description || '{}');
                        return pObj.orientation === 'senkrecht' || pObj.direction === 'senkrecht' || pObj.direction === 'down' || pObj.direction === 'up';
                    } catch { return false; }
                })();
                const w_norm = isSenkrecht ? 0.0036 : 0.015;
                const h_norm = isSenkrecht ? 0.025 : 0.006;
                const cx = s1.x_norm + w_norm / 2;
                const cy = s1.y_norm + h_norm / 2;

                const isLeftRightEdge = Math.abs(pB.x_norm - cx) > Math.abs(pB.y_norm - cy);
                if (isLeftRightEdge) {
                    corner = { x_norm: pB.x_norm, y_norm: pA.y_norm };
                } else {
                    corner = { x_norm: pA.x_norm, y_norm: pB.y_norm };
                }
            } else {
                corner = Math.abs(dx) >= Math.abs(dy)
                    ? { x_norm: pB.x_norm, y_norm: pA.y_norm }
                    : { x_norm: pA.x_norm, y_norm: pB.y_norm };
            }
        } else {
            if (Math.abs(dx) >= Math.abs(dy)) {
                corner = { x_norm: pB.x_norm, y_norm: pA.y_norm };
            } else {
                corner = { x_norm: pA.x_norm, y_norm: pB.y_norm };
            }
        }

        result.push(corner, pB);
    }

    const cleaned: Array<{ x_norm: number; y_norm: number }> = [result[0]];
    for (let i = 1; i < result.length; i++) {
        const prev = cleaned[cleaned.length - 1];
        const curr = result[i];
        if (Math.abs(curr.x_norm - prev.x_norm) < 0.0001 && Math.abs(curr.y_norm - prev.y_norm) < 0.0001) {
            continue;
        }
        if (cleaned.length >= 2) {
            const prevPrev = cleaned[cleaned.length - 2];
            const isHoriz = Math.abs(prev.y_norm - prevPrev.y_norm) < 0.0001 && Math.abs(curr.y_norm - prev.y_norm) < 0.0001;
            const isVert = Math.abs(prev.x_norm - prevPrev.x_norm) < 0.0001 && Math.abs(curr.x_norm - prev.x_norm) < 0.0001;
            if (isHoriz || isVert) {
                cleaned[cleaned.length - 1] = curr;
                continue;
            }
        }
        cleaned.push(curr);
    }

    return cleaned;
}

export function makePathOrthogonal(pts: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
    if (!pts || pts.length < 2) return pts;
    const ortho: Array<{ x: number; y: number }> = [pts[0]];

    for (let i = 1; i < pts.length; i++) {
        const prev = ortho[ortho.length - 1];
        const curr = pts[i];
        const dx = Math.abs(curr.x - prev.x);
        const dy = Math.abs(curr.y - prev.y);

        if (dx > 3 && dy > 3) {
            const corner = { x: curr.x, y: prev.y };
            ortho.push(corner);
        }
        ortho.push(curr);
    }
    return ortho;
}

export function getPdfCablePointsForPlan(c: any, plan: any, mapX: (x: number) => number, mapY: (y: number) => number): Array<{ x: number; y: number }> | null {
    const m = c.metadata || {};
    const isFree = c.type === 'FREE_LINE' || m.is_free_line;

    if (isFree) {
        if (m.plan_id && plan.planId && m.plan_id !== plan.planId && m.source_plan_id !== plan.planId) {
            return null;
        }
        const wps: Array<{ x_norm: number; y_norm: number }> = m.waypoints || [];
        if (wps.length < 2) return null;

        // Group parallel free lines with similar start & end points
        const freeCorridor = (plan.cableConnections || []).filter((item: any) => {
            const im = item.metadata || {};
            const itemIsFree = item.type === 'FREE_LINE' || im.is_free_line;
            if (!itemIsFree) return false;
            const iwps = im.waypoints || [];
            if (iwps.length < 2) return false;
            const dStart = Math.abs(iwps[0].x_norm - wps[0].x_norm) + Math.abs(iwps[0].y_norm - wps[0].y_norm);
            const dEnd = Math.abs(iwps[iwps.length - 1].x_norm - wps[wps.length - 1].x_norm) + Math.abs(iwps[iwps.length - 1].y_norm - wps[wps.length - 1].y_norm);
            return dStart < 0.06 && dEnd < 0.06;
        });

        const freeIdx = freeCorridor.findIndex((item: any) => item.id === c.id);
        const mult = (freeCorridor.length > 1 && freeIdx >= 0) ? (freeIdx - (freeCorridor.length - 1) / 2) : 0;
        const mapWVal = Math.abs(mapX(1) - mapX(0)) || 1000;
        const mapHVal = Math.abs(mapY(1) - mapY(0)) || 1000;
        const offsetXNorm = (14 / mapWVal) * mult;
        const offsetYNorm = (14 / mapHVal) * mult;

        if (mult !== 0 && wps.length >= 2) {
            const segShifts: Array<{ sx: number; sy: number }> = [];
            for (let i = 0; i < wps.length - 1; i++) {
                const pA = wps[i];
                const pB = wps[i + 1];
                const isHoriz = Math.abs(pB.x_norm - pA.x_norm) >= Math.abs(pB.y_norm - pA.y_norm);
                if (isHoriz) {
                    segShifts.push({ sx: 0, sy: mult * offsetYNorm });
                } else {
                    segShifts.push({ sx: mult * offsetXNorm, sy: 0 });
                }
            }
            const shiftedWps = wps.map((pt, i) => {
                if (i === 0) return { x_norm: pt.x_norm + segShifts[0].sx, y_norm: pt.y_norm + segShifts[0].sy };
                if (i === wps.length - 1) {
                    const last = segShifts[segShifts.length - 1];
                    return { x_norm: pt.x_norm + last.sx, y_norm: pt.y_norm + last.sy };
                }
                const prevS = segShifts[i - 1];
                const nextS = segShifts[i];
                return {
                    x_norm: pt.x_norm + (prevS.sx || nextS.sx),
                    y_norm: pt.y_norm + (prevS.sy || nextS.sy),
                };
            });
            const pts = shiftedWps.map((p: any) => ({ x: mapX(p.x_norm), y: mapY(p.y_norm) }));
            return makePathOrthogonal(pts);
        }

        const pts = wps.map((p: any) => ({ x: mapX(p.x_norm), y: mapY(p.y_norm) }));
        return makePathOrthogonal(pts);
    }

    const s1 = plan.bmaSymbols?.find((s: any) => s.id === m.source_symbol_id);
    const s2 = plan.bmaSymbols?.find((s: any) => s.id === m.target_symbol_id);
    const rawWpts: Array<{ x_norm: number; y_norm: number }> = m.waypoints || [];

    // Cable MUST connect two devices present on this plan. If either device is missing/on another plan, do not render stub lines.
    if (!s1 || !s2) {
        return null;
    }

    const target1Norm = rawWpts.length > 0 ? rawWpts[0] : { x_norm: s2.x_norm, y_norm: s2.y_norm };
    const target2Norm = rawWpts.length > 0 ? rawWpts[rawWpts.length - 1] : { x_norm: s1.x_norm, y_norm: s1.y_norm };

    const c1Norm = getPdfSymbolConnectionPoint(s1, target1Norm) ?? { x_norm: s1.x_norm, y_norm: s1.y_norm };
    const c2Norm = getPdfSymbolConnectionPoint(s2, target2Norm) ?? { x_norm: s2.x_norm, y_norm: s2.y_norm };

    // Determine parallel corridor offset
    const isVert = Math.abs(s1.y_norm - s2.y_norm) >= Math.abs(s1.x_norm - s2.x_norm);
    const corridorCables = (plan.cableConnections || []).filter((item: any) => {
        const im = item.metadata || {};
        const itemS1 = plan.bmaSymbols?.find((s: any) => s.id === im.source_symbol_id);
        const itemS2 = plan.bmaSymbols?.find((s: any) => s.id === im.target_symbol_id);
        if (!itemS1 || !itemS2) return false;

        const isVertItem = Math.abs(itemS1.y_norm - itemS2.y_norm) >= Math.abs(itemS1.x_norm - itemS2.x_norm);
        if (isVertItem !== isVert) return false;

        if (isVert) {
            const xThis = (s1.x_norm + s2.x_norm) / 2;
            const xItem = (itemS1.x_norm + itemS2.x_norm) / 2;
            return Math.abs(xThis - xItem) < 0.025;
        } else {
            const yThis = (s1.y_norm + s2.y_norm) / 2;
            const yItem = (itemS1.y_norm + itemS2.y_norm) / 2;
            return Math.abs(yThis - yItem) < 0.025;
        }
    });

    const corridorIdx = corridorCables.findIndex((item: any) => item.id === c.id);
    const mult = (corridorCables.length > 1 && corridorIdx >= 0) ? (corridorIdx - (corridorCables.length - 1) / 2) : 0;
    const mapWVal = Math.abs(mapX(1) - mapX(0)) || 1000;
    const mapHVal = Math.abs(mapY(1) - mapY(0)) || 1000;
    const offsetXNorm = (12 / mapWVal) * mult;
    const offsetYNorm = (12 / mapHVal) * mult;

    let baseNormPts: Array<{ x_norm: number; y_norm: number }> = [];
    if (rawWpts.length > 0) {
        const shiftedWpts = rawWpts.map((wp: any) => ({
            x_norm: isVert ? wp.x_norm + offsetXNorm : wp.x_norm,
            y_norm: isVert ? wp.y_norm : wp.y_norm + offsetYNorm,
        }));
        baseNormPts = [c1Norm, ...shiftedWpts, c2Norm];
    } else {
        if (isVert) {
            const trunkX = (c1Norm.x_norm + c2Norm.x_norm) / 2 + offsetXNorm;
            baseNormPts = [
                c1Norm,
                { x_norm: trunkX, y_norm: c1Norm.y_norm },
                { x_norm: trunkX, y_norm: c2Norm.y_norm },
                c2Norm,
            ];
        } else {
            const trunkY = (c1Norm.y_norm + c2Norm.y_norm) / 2 + offsetYNorm;
            baseNormPts = [
                c1Norm,
                { x_norm: c1Norm.x_norm, y_norm: trunkY },
                { x_norm: c2Norm.x_norm, y_norm: trunkY },
                c2Norm,
            ];
        }
    }

    const normPts = makeStrictOrthoPolyline(baseNormPts, s1, s2);
    return normPts.map((p) => ({ x: mapX(p.x_norm), y: mapY(p.y_norm) }));
}

function computeDeconflictedCableBadges(
    cableConnections: any[],
    plan: any,
    options: any,
    mapX: (x: number) => number,
    mapY: (y: number) => number,
    deconflictedLabels?: any[]
) {
    if (options.includeCables === false || !cableConnections || cableConnections.length === 0) {
        return [];
    }

    type BadgeCandidate = {
        id: string;
        cableNum: string;
        lx: number;
        ly: number;
        bw: number;
        bh: number;
        borderColor: string;
        pts: Array<{ x: number; y: number }>;
    };

    const initialBadges: BadgeCandidate[] = [];

    cableConnections.forEach((c: any, cIdx: number) => {
        const m = c.metadata || {};
        const isFree = c.type === 'FREE_LINE' || m.is_free_line;
        const borderColor = c.color || (isFree ? '#d97706' : '#1d4ed8');
        const cableNum = m.cable_number || c.name || '';
        if (!cableNum) return;

        const pts = getPdfCablePointsForPlan(c, plan, mapX, mapY);
        if (!pts || pts.length < 2) return;

        let totalLen = 0; const segLens: number[] = [];
        for (let i = 1; i < pts.length; i++) {
            const d = Math.sqrt(Math.pow(pts[i].x - pts[i-1].x, 2) + Math.pow(pts[i].y - pts[i-1].y, 2));
            segLens.push(d); totalLen += d;
        }

        // Stagger badge positions along polyline using widely separated fractions across full length
        const fracs = [0.15, 0.85, 0.50, 0.30, 0.70, 0.20, 0.80];
        const badgeFrac = fracs[cIdx % fracs.length];
        const clampedFrac = Math.max(0.08, Math.min(0.92, badgeFrac));
        let targetDist = totalLen * clampedFrac;
        let lx = pts[0].x, ly = pts[0].y;
        for (let i = 0; i < segLens.length; i++) {
            if (targetDist <= segLens[i]) {
                const t = targetDist / (segLens[i] || 1);
                lx = pts[i].x + t * (pts[i+1].x - pts[i].x);
                ly = pts[i].y + t * (pts[i+1].y - pts[i].y);
                break;
            }
            targetDist -= segLens[i];
        }

        const bw = Math.max(26, cableNum.length * 6.5 + 8);
        const bh = 14;

        initialBadges.push({
            id: c.id || `cable-${cIdx}`,
            cableNum,
            lx,
            ly,
            bw,
            bh,
            borderColor,
            pts,
        } as any);
    });

    const placedBoxes: Array<{ x: number; y: number; w: number; h: number }> = [];

    // Pre-populate placedBoxes with ALL symbol icon boxes & label badges to prevent cable badges from covering device icons or text!
    if (plan.bmaSymbols && Array.isArray(plan.bmaSymbols)) {
        for (const s of plan.bmaSymbols) {
            if (!isSymbolIncluded(s.symbol_type, options)) continue;
            const cx = mapX(s.x_norm);
            const cy = mapY(s.y_norm);
            let iconW = 20, iconH = 20;
            if (s.symbol_type === 'infrarotheizung') {
                let isSenkrecht = false;
                try {
                    const pObj = JSON.parse(s.description || '{}');
                    isSenkrecht = pObj.orientation === 'senkrecht' || pObj.direction === 'senkrecht' || pObj.direction === 'down' || pObj.direction === 'up';
                } catch {}
                iconW = isSenkrecht ? 24 : 64;
                iconH = isSenkrecht ? 64 : 24;
            } else if (s.symbol_type === 'warmepumpe_aussen' || s.symbol_type === 'warmepumpe_innen') {
                iconW = 40; iconH = 40;
            } else if (s.symbol_type === 'geraet_box') {
                iconW = 50; iconH = 30;
            }

            placedBoxes.push({
                x: cx - iconW / 2 - 4,
                y: cy - iconH / 2 - 4,
                w: iconW + 8,
                h: iconH + 8,
            });
        }
    }

    if (deconflictedLabels && Array.isArray(deconflictedLabels)) {
        for (const lbl of deconflictedLabels) {
            placedBoxes.push({
                x: lbl.badgeX - 4,
                y: lbl.badgeY - 4,
                w: lbl.badgeW + 8,
                h: lbl.badgeH + 8,
            });
        }
    }

    const intersects = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, pad = 3) => {
        return (
            a.x < b.x + b.w + pad &&
            a.x + a.w + pad > b.x &&
            a.y < b.y + b.h + pad &&
            a.y + a.h + pad > b.y
        );
    };

    const finalBadges: Array<BadgeCandidate & { finalX: number; finalY: number }> = [];

    for (const b of initialBadges) {
        let bestX = b.lx - b.bw / 2;
        let bestY = b.ly - b.bh / 2;
        let candidateBox = { x: bestX, y: bestY, w: b.bw, h: b.bh };

        let hasCollision = placedBoxes.some((box) => intersects(candidateBox, box));

        if (hasCollision) {
            const bPts = b.pts;
            const branchCandidates: Array<{ x: number; y: number }> = [];

            if (bPts.length >= 2) {
                // 1. Branch stub at source device bPts[0]
                const p0 = bPts[0], p1 = bPts[1];
                const s1Len = Math.sqrt((p1.x - p0.x)**2 + (p1.y - p0.y)**2);
                if (s1Len > 5) {
                    for (const d of [24, 45, 14, 65, 85]) {
                        if (d < s1Len) {
                            const t = d / s1Len;
                            branchCandidates.push({ x: p0.x + t * (p1.x - p0.x), y: p0.y + t * (p1.y - p0.y) });
                        }
                    }
                }

                // 2. Branch stub at target device bPts[bPts.length-1]
                const pN = bPts[bPts.length - 1], pN1 = bPts[bPts.length - 2];
                const sNLen = Math.sqrt((pN.x - pN1.x)**2 + (pN.y - pN1.y)**2);
                if (sNLen > 5) {
                    for (const d of [24, 45, 14, 65, 85]) {
                        if (d < sNLen) {
                            const t = d / sNLen;
                            branchCandidates.push({ x: pN.x - t * (pN.x - pN1.x), y: pN.y - t * (pN.y - pN1.y) });
                        }
                    }
                }
            }

            let foundAlt = false;

            // 1. Primary search: test branch stub candidates near devices first!
            for (const cand of branchCandidates) {
                const testBox = { x: cand.x - b.bw / 2, y: cand.y - b.bh / 2, w: b.bw, h: b.bh };
                if (!placedBoxes.some((box) => intersects(testBox, box))) {
                    bestX = testBox.x;
                    bestY = testBox.y;
                    candidateBox = testBox;
                    hasCollision = false;
                    foundAlt = true;
                    break;
                }
            }

            // 2. Secondary search: if branch stubs are crowded, test branch candidates with clear offsets (above/below/aside)
            if (!foundAlt) {
                const tightOffsets = [
                    { dx: 0, dy: -18 },
                    { dx: 0, dy: 18 },
                    { dx: -40, dy: 0 },
                    { dx: 40, dy: 0 },
                    { dx: -25, dy: -18 },
                    { dx: 25, dy: 18 },
                    { dx: 0, dy: -34 },
                    { dx: 0, dy: 34 },
                    { dx: -55, dy: 0 },
                    { dx: 55, dy: 0 },
                ];
                for (const cand of branchCandidates) {
                    for (const off of tightOffsets) {
                        const testBox = { x: cand.x - b.bw / 2 + off.dx, y: cand.y - b.bh / 2 + off.dy, w: b.bw, h: b.bh };
                        if (!placedBoxes.some((box) => intersects(testBox, box))) {
                            bestX = testBox.x;
                            bestY = testBox.y;
                            candidateBox = testBox;
                            hasCollision = false;
                            foundAlt = true;
                            break;
                        }
                    }
                    if (foundAlt) break;
                }
            }
        }

        placedBoxes.push(candidateBox);
        finalBadges.push({
            ...b,
            finalX: Math.round(bestX),
            finalY: Math.round(bestY),
        });
    }

    return finalBadges;
}

export default function PlanElementsPdf({
    projectName,
    plansData,
    options,
    translations,
}: PlanElementsPdfProps) {
    const showBma = options.includeBma ?? true;
    const showNotlicht = options.includeNotlicht ?? options.includeBma ?? true;
    const showLighting = options.includeLighting ?? options.includeBma ?? true;
    const showKabelbahn = options.includeKabelbahn ?? options.includeLighting ?? options.includeBma ?? true;

    return (
        <Document>
            {plansData.map((plan, planIdx) => {
                const planLabel = [plan.buildingName, plan.floorName, plan.planName].filter(Boolean).join(' › ') || `Plan ${planIdx + 1}`;

                // Calculate BMA & Notbeleuchtung subtype counts
                const redCount = plan.bmaSymbols.filter(s => s.symbol_type === 'detector_red').length;
                const blueCount = plan.bmaSymbols.filter(s => s.symbol_type === 'detector_blue').length;
                const disCount = plan.bmaSymbols.filter(s => s.symbol_type === 'dis_signalgeber').length;
                const sireneCount = plan.bmaSymbols.filter(s => s.symbol_type === 'sirene').length;
                const lampeCount = plan.bmaSymbols.filter(s => s.symbol_type === 'lampe').length;
                const ledStripeCount = plan.bmaSymbols.filter(s => s.symbol_type === 'led_stripe').length;
                const notlichtLampeCount = plan.bmaSymbols.filter(s => s.symbol_type === 'notlicht_lampe').length;
                const notlichtPiktoCount = plan.bmaSymbols.filter(s => s.symbol_type === 'notlicht_pikto' || s.symbol_type === 'notlicht_pikto_gross').length;
                const tempFuehlerCount = plan.bmaSymbols.filter(s => s.symbol_type === 'temperaturfuehler').length;
                const kabelauslassCount = plan.bmaSymbols.filter(s => s.symbol_type === 'kabelauslass').length;

                // Calculate image layout with aspect ratio preservation
                const imgW = Math.max(100, Number(plan.imageWidth) || 3000);
                const imgH = Math.max(100, Number(plan.imageHeight) || 2000);
                const gridW = Math.max(imgW, Number(plan.gridWidth) || imgW);
                const gridH = Math.max(imgH, Number(plan.gridHeight) || imgH);

                // Leaflet normalized coords are relative to gridW x gridH.
                // Scale factor converts from tile grid space to visual image space.
                const scaleX = gridW / imgW;
                const scaleY = gridH / imgH;

                const imgRatio = imgW / imgH;
                const containerRatio = CONTAINER_W / CONTAINER_H;

                let renderW: number;
                let renderH: number;
                let offsetX: number;
                let offsetY: number;

                if (imgRatio > containerRatio) {
                    renderW = CONTAINER_W;
                    renderH = Math.round(CONTAINER_W / imgRatio);
                    offsetX = 0;
                    offsetY = Math.round((CONTAINER_H - renderH) / 2);
                } else {
                    renderH = CONTAINER_H;
                    renderW = Math.round(CONTAINER_H * imgRatio);
                    offsetX = Math.round((CONTAINER_W - renderW) / 2);
                    offsetY = 0;
                }

                // Helper to map normalized coordinate to container pixel coordinate
                const mapX = (xNorm: number) => {
                    const val = Number(xNorm);
                    const n = isNaN(val) ? 0 : val;
                    return Math.round(offsetX + (n * scaleX * renderW));
                };
                const mapY = (yNorm: number) => {
                    const val = Number(yNorm);
                    const n = isNaN(val) ? 0 : val;
                    return Math.round(offsetY + (n * scaleY * renderH));
                };
                const mapW = (wNorm: number) => {
                    const val = Number(wNorm);
                    const n = isNaN(val) ? 0.05 : Math.max(0.001, Math.min(1, val));
                    return Math.round(n * scaleX * renderW);
                };
                const mapH = (hNorm: number) => {
                    const val = Number(hNorm);
                    const n = isNaN(val) ? 0.05 : Math.max(0.001, Math.min(1, val));
                    return Math.round(n * scaleY * renderH);
                };

                const visiblePointSymbols = plan.bmaSymbols.filter(
                    s => isSymbolIncluded(s.symbol_type, options) && s.symbol_type !== 'kabelbahn' && s.symbol_type !== 'led_stripe' && s.symbol_type !== 'revision_cloud' && s.symbol_type !== 'abdeckung_box'
                );
                const deconflictedLabels = computeDeconflictedLabels(visiblePointSymbols, mapX, mapY, plan.lampTypes?.variants);
                const deconflictedCableBadges = computeDeconflictedCableBadges(plan.cableConnections ?? [], plan, options, mapX, mapY, deconflictedLabels);

                if (options.onlyKabelzugliste === true || (options.includePlanOverview === false && (options as any).onlyPlanGraphics !== true && options.includeBma === false && options.includeNotlicht === false && options.includeLighting === false && options.includeHeating === false && options.includeKabelbahn === false && options.includeKabelauslass === false && options.includeCables === false && options.includeMeasurements === false && options.includeKlappen === false && options.includePhotoPins === false)) {
                    return null;
                }

                return (
                    <Page
                        key={plan.planId}
                        size="A0"
                        orientation="landscape"
                        style={styles.page}
                        wrap={false}
                    >
                        {/* ── TOP PLAN INFO & COUNTERS BAR (Multi-language + BMA Breakdown + Notbeleuchtung) ── */}
                        <View style={styles.header}>
                            <View style={styles.headerLeft}>
                                <Text style={styles.headerProject}>{translations.project || 'Projekt'}: <Text style={styles.headerProjectName}>{projectName}</Text></Text>
                                <Text style={styles.headerDivider}>|</Text>
                                <Text style={styles.headerPlan}>{planLabel}</Text>
                            </View>
                            <View style={styles.headerBadges}>
                                {options.includeKlappen && (
                                    <View style={[styles.badge, { backgroundColor: '#fef3c7', borderColor: '#d97706' }]}>
                                        <Text style={[styles.badgeText, { color: '#92400e' }]}>{translations.klappenTitle || 'Revisionsklappen'}: {plan.klappen.length}</Text>
                                    </View>
                                )}
                                {showBma && (
                                    <>
                                        {redCount > 0 && (
                                            <View style={[styles.badge, { backgroundColor: '#fee2e2', borderColor: '#dc2626' }]}>
                                                <Text style={[styles.badgeText, { color: '#991b1b' }]}>{translations.dMelder || 'D-Melder'}: {redCount}</Text>
                                            </View>
                                        )}
                                        {blueCount > 0 && (
                                            <View style={[styles.badge, { backgroundColor: '#dbeafe', borderColor: '#2563eb' }]}>
                                                <Text style={[styles.badgeText, { color: '#1e40af' }]}>{translations.zwdMelder || 'ZWD-Melder'}: {blueCount}</Text>
                                            </View>
                                        )}
                                        {disCount > 0 && (
                                            <View style={[styles.badge, { backgroundColor: '#ffedd5', borderColor: '#ea580c' }]}>
                                                <Text style={[styles.badgeText, { color: '#9a3412' }]}>{translations.disSignalgeber || 'D-Melder mit Sirene'}: {disCount}</Text>
                                            </View>
                                        )}
                                        {sireneCount > 0 && (
                                            <View style={[styles.badge, { backgroundColor: '#fee2e2', borderColor: '#dc2626' }]}>
                                                <Text style={[styles.badgeText, { color: '#991b1b' }]}>{translations.sirene || 'Sirene'}: {sireneCount}</Text>
                                            </View>
                                        )}
                                    </>
                                )}
                                {showLighting && (
                                    <>
                                        {lampeCount > 0 && (
                                            <View style={[styles.badge, { backgroundColor: '#ffedd5', borderColor: '#f97316' }]}>
                                                <Text style={[styles.badgeText, { color: '#ea580c' }]}>Lampe: {lampeCount}</Text>
                                            </View>
                                        )}
                                        {ledStripeCount > 0 && (
                                            <View style={[styles.badge, { backgroundColor: '#fef9c3', borderColor: '#eab308' }]}>
                                                <Text style={[styles.badgeText, { color: '#854d0e' }]}>LED: {ledStripeCount}</Text>
                                            </View>
                                        )}
                                        {kabelauslassCount > 0 && (
                                            <View style={[styles.badge, { backgroundColor: '#f1f5f9', borderColor: '#475569' }]}>
                                                <Text style={[styles.badgeText, { color: '#1e293b' }]}>Kabelauslass: {kabelauslassCount}</Text>
                                            </View>
                                        )}
                                    </>
                                )}
                                {showNotlicht && (
                                    <>
                                        {notlichtLampeCount > 0 && (
                                            <View style={[styles.badge, { backgroundColor: '#dcfce7', borderColor: '#16a34a' }]}>
                                                <Text style={[styles.badgeText, { color: '#166534' }]}>{translations.notlichtLampe || 'Notbeleuchtung'}: {notlichtLampeCount}</Text>
                                            </View>
                                        )}
                                        {notlichtPiktoCount > 0 && (
                                            <View style={[styles.badge, { backgroundColor: '#dcfce7', borderColor: '#16a34a' }]}>
                                                <Text style={[styles.badgeText, { color: '#166534' }]}>{translations.notlichtPikto || 'Pikto'}: {notlichtPiktoCount}</Text>
                                            </View>
                                        )}
                                    </>
                                )}
                            </View>
                        </View>

                        {/* ── FULL BLEED PLAN CONTAINER ── */}
                        <View style={styles.container}>
                            {/* High-Resolution Plan Image Background */}
                            {plan.imageBase64 && (
                                <Image
                                    src={plan.imageBase64}
                                    style={{
                                        position: 'absolute',
                                        left: offsetX,
                                        top: offsetY,
                                        width: renderW,
                                        height: renderH,
                                    }}
                                />
                            )}

                            {/* Vector SVG Overlays */}
                            <Svg
                                style={{
                                    position: 'absolute',
                                    left: 0,
                                    top: 0,
                                    width: CONTAINER_W,
                                    height: CONTAINER_H,
                                }}
                            >
                                {/* 1. Measurements Vector Polyline + Dimensions directly on EVERY segment */}
                                {options.includeMeasurements && plan.measurements.map((m) => {
                                    if (!m.points || m.points.length < 2) return null;
                                    const dPath = `M ${m.points.map(p => `${mapX(p.x_norm)} ${mapY(p.y_norm)}`).join(' L ')}`;

                                    return (
                                        <G key={m.id}>
                                            {/* White halo line */}
                                            <Path
                                                d={dPath}
                                                stroke="#ffffff"
                                                strokeWidth={MEAS_STROKE + 2.5}
                                                strokeOpacity={0.95}
                                                fill="none"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            />
                                            {/* Main measurement dashed line */}
                                            <Path
                                                d={dPath}
                                                stroke={COLORS.meas}
                                                strokeWidth={MEAS_STROKE}
                                                fill="none"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeDasharray="8,5"
                                            />
                                            {/* Vertex dots */}
                                            {m.points.map((p, i) => (
                                                <Circle
                                                    key={i}
                                                    cx={mapX(p.x_norm)}
                                                    cy={mapY(p.y_norm)}
                                                    r={3}
                                                    fill={COLORS.meas}
                                                    stroke="#ffffff"
                                                    strokeWidth={1}
                                                />
                                            ))}
                                            {/* Dimensions directly on EVERY segment */}
                                            {m.points.slice(1).map((pB, segIdx) => {
                                                const pA = m.points[segIdx];
                                                const x1 = mapX(pA.x_norm);
                                                const y1 = mapY(pA.y_norm);
                                                const x2 = mapX(pB.x_norm);
                                                const y2 = mapY(pB.y_norm);
                                                const midX = Math.round((x1 + x2) / 2);
                                                const midY = Math.round((y1 + y2) / 2);

                                                const segData = m.segments?.[segIdx];
                                                const segDistText = formatSegText(segData?.distMeters ?? m.distanceMeters, segData?.distPx);
                                                if (!segDistText) return null;

                                                return (
                                                    <G key={`${m.id}_seg_${segIdx}`}>
                                                        <SvgText
                                                            x={midX}
                                                            y={midY - 4}
                                                            fill="#ffffff"
                                                            stroke="#ffffff"
                                                            strokeWidth={4}
                                                            textAnchor="middle"
                                                            style={{ fontSize: 13, fontWeight: 'bold' }}
                                                        >
                                                            {segDistText}
                                                        </SvgText>
                                                        <SvgText
                                                            x={midX}
                                                            y={midY - 4}
                                                            fill="#4c1d95"
                                                            textAnchor="middle"
                                                            style={{ fontSize: 13, fontWeight: 'bold' }}
                                                        >
                                                            {segDistText}
                                                        </SvgText>
                                                    </G>
                                                );
                                            })}
                                        </G>
                                    );
                                })}

                                 {/* 1.4. Revisionsklappen Vector Rectangles + Dimension Text (Rendered UNDER BMA symbols) */}
                                {options.includeKlappen && plan.klappen.map((k) => {
                                    const rx = mapX(k.x_norm);
                                    const ry = mapY(k.y_norm);
                                    const rw = mapW(k.w_norm);
                                    const rh = mapH(k.h_norm);
                                    const midX = Math.round(rx + rw / 2);
                                    const dimText = (k.width_cm && k.height_cm)
                                        ? `${k.width_cm}x${k.height_cm}`
                                        : (k.label || (k.width_cm ? `${k.width_cm}` : null));

                                    return (
                                        <G key={k.id}>
                                            <Rect
                                                x={rx}
                                                y={ry}
                                                width={rw}
                                                height={rh}
                                                fill="#fef3c7"
                                                fillOpacity={0.25}
                                                stroke={COLORS.klappen}
                                                strokeWidth={RK_STROKE}
                                            />
                                            <Line
                                                x1={rx}
                                                y1={ry}
                                                x2={rx + rw}
                                                y2={ry + rh}
                                                stroke={COLORS.klappen}
                                                strokeWidth={RK_STROKE - 1}
                                                strokeOpacity={0.6}
                                            />
                                            <Line
                                                x1={rx + rw}
                                                y1={ry}
                                                x2={rx}
                                                y2={ry + rh}
                                                stroke={COLORS.klappen}
                                                strokeWidth={RK_STROKE - 1}
                                                strokeOpacity={0.6}
                                            />
                                            {/* Dimension Text placed above top edge of Revisionsklappe */}
                                            {dimText ? (
                                                <>
                                                    <SvgText
                                                        x={midX}
                                                        y={ry - 5}
                                                        fill="#ffffff"
                                                        stroke="#ffffff"
                                                        strokeWidth={4}
                                                        textAnchor="middle"
                                                        style={{ fontSize: 13, fontWeight: 'bold' }}
                                                    >
                                                        {dimText}
                                                    </SvgText>
                                                    <SvgText
                                                        x={midX}
                                                        y={ry - 5}
                                                        fill="#b45309"
                                                        textAnchor="middle"
                                                        style={{ fontSize: 13, fontWeight: 'bold' }}
                                                    >
                                                        {dimText}
                                                    </SvgText>
                                                </>
                                            ) : null}
                                        </G>
                                    );
                                })}

                                {/* 1.45. Photo Pins Vector Circles (Generic / Lamp Photos - Blue) */}
                                {options.includePhotoPins && (plan.photoPins || []).map((p) => {
                                    const cx = mapX(p.x_norm);
                                    const cy = mapY(p.y_norm);
                                    return (
                                        <G key={`photo-${p.id}`}>
                                            <Circle
                                                cx={cx}
                                                cy={cy}
                                                r={PIN_R}
                                                fill="#0284c7"
                                                fillOpacity={0.85}
                                                stroke="#ffffff"
                                                strokeWidth={1.5}
                                            />
                                        </G>
                                    );
                                })}

                                {/* 1.46. Montage-Doku Vector Badges (Montage - Purple / Gold) */}
                                {options.includeMontageDoku && (plan.montagePins || []).map((p) => {
                                    const cx = mapX(p.x_norm);
                                    const cy = mapY(p.y_norm);
                                    const r = PIN_R * 1.15;
                                    return (
                                        <G key={`montage-${p.id}`}>
                                            <Rect
                                                x={cx - r}
                                                y={cy - r}
                                                width={r * 2}
                                                height={r * 2}
                                                rx={4}
                                                fill="#7c3aed"
                                                fillOpacity={0.9}
                                                stroke="#fbbf24"
                                                strokeWidth={2}
                                            />
                                        </G>
                                    );
                                })}

                                {/* 1.47. Beschädigung Vector Badges (Damage - Red / Amber Warning) */}
                                {options.includeDamage && (plan.damagePins || []).map((p) => {
                                    const cx = mapX(p.x_norm);
                                    const cy = mapY(p.y_norm);
                                    const r = PIN_R * 1.15;
                                    return (
                                        <G key={`damage-${p.id}`}>
                                            <Rect
                                                x={cx - r}
                                                y={cy - r}
                                                width={r * 2}
                                                height={r * 2}
                                                rx={4}
                                                fill="#ef4444"
                                                fillOpacity={0.9}
                                                stroke="#fee2e2"
                                                strokeWidth={2}
                                            />
                                        </G>
                                    );
                                })}

                                 {/* 1.5. White Mask Cover Rectangles (abdeckung_box) - Masks unwanted plan background */}
                                 {plan.bmaSymbols.filter(s => isSymbolIncluded(s.symbol_type, options) && s.symbol_type === 'abdeckung_box').map((s) => {
                                     let w_norm = 0.05;
                                     let h_norm = 0.03;
                                     try {
                                         const pObj = JSON.parse(s.description || '{}');
                                         if (typeof pObj.w_norm === 'number') w_norm = pObj.w_norm;
                                         if (typeof pObj.h_norm === 'number') h_norm = pObj.h_norm;
                                     } catch {}

                                     const rx = mapX(s.x_norm);
                                     const ry = mapY(s.y_norm);
                                     const rw = mapW(w_norm);
                                     const rh = mapH(h_norm);

                                     return (
                                         <Rect
                                             key={`abdeckung-${s.id}`}
                                             x={rx}
                                             y={ry}
                                             width={rw}
                                             height={rh}
                                             fill="#ffffff"
                                             fillOpacity={1.0}
                                             stroke="#ffffff"
                                             strokeWidth={0}
                                         />
                                     );
                                 })}
                                 {/* 1.6. Revision Clouds (revision_cloud) - Red Scalloped Revision Box */}
                                  {plan.bmaSymbols.filter(s => isSymbolIncluded(s.symbol_type, options) && s.symbol_type === 'revision_cloud').map((s) => {
                                      let w_norm = 0.08;
                                      let h_norm = 0.05;
                                      let customDesc = '';
                                      try {
                                          const pObj = JSON.parse(s.description || '{}');
                                          if (typeof pObj.w_norm === 'number') w_norm = pObj.w_norm;
                                          if (typeof pObj.h_norm === 'number') h_norm = pObj.h_norm;
                                          if (pObj.desc) customDesc = pObj.desc;
                                      } catch {
                                          if (s.description && !s.description.startsWith('{')) customDesc = s.description;
                                      }

                                      const rx = mapX(s.x_norm);
                                      const ry = mapY(s.y_norm);
                                      const rw = mapW(w_norm);
                                      const rh = mapH(h_norm);
                                      const cloudD = generateRevisionCloudPath(rx, ry, rw, rh);

                                      const labelText = s.label || 'Hinweis';
                                      const [line1, line2] = splitRevisionCloudText(labelText, customDesc, 55);
                                      const maxLineLen = Math.max(line1.length, line2.length);
                                      const badgeWidth = Math.max(70, maxLineLen * 7.2 + 18);
                                      const badgeHeight = line2 ? 34 : 20;

                                      return (
                                          <G key={`revcloud-${s.id}`}>
                                              <Path
                                                  d={cloudD}
                                                  fill="#ef4444"
                                                  fillOpacity={0.05}
                                                  stroke="#ef4444"
                                                  strokeWidth={1.2}
                                              />
                                              <G key={`revcloud-lbl-${s.id}`}>
                                                  <Rect
                                                      x={rx + rw / 2 - badgeWidth / 2}
                                                      y={ry - badgeHeight - 3}
                                                      width={badgeWidth}
                                                      height={badgeHeight}
                                                      fill="#ffffff"
                                                      fillOpacity={0.96}
                                                      stroke="#ef4444"
                                                      strokeWidth={1.2}
                                                      rx={4}
                                                  />
                                                  {line2 ? (
                                                      <>
                                                          <SvgText
                                                              x={rx + rw / 2}
                                                              y={ry - badgeHeight + 11}
                                                              style={{
                                                                  fontSize: 11,
                                                                  fontWeight: 'bold',
                                                                  fill: '#dc2626',
                                                                  textAnchor: 'middle',
                                                              }}
                                                          >
                                                              {line1}
                                                          </SvgText>
                                                          <SvgText
                                                              x={rx + rw / 2}
                                                              y={ry - badgeHeight + 25}
                                                              style={{
                                                                  fontSize: 11,
                                                                  fontWeight: 'bold',
                                                                  fill: '#dc2626',
                                                                  textAnchor: 'middle',
                                                              }}
                                                          >
                                                              {line2}
                                                          </SvgText>
                                                      </>
                                                  ) : (
                                                      <SvgText
                                                          x={rx + rw / 2}
                                                          y={ry - 5}
                                                          style={{
                                                              fontSize: 12.5,
                                                              fontWeight: 'bold',
                                                              fill: '#dc2626',
                                                              textAnchor: 'middle',
                                                          }}
                                                      >
                                                          {line1}
                                                      </SvgText>
                                                  )}
                                              </G>
                                          </G>
                                      );
                                  })}

                                {/* 4. Kabelbahn Vector Ladder Trays */}
                                {showKabelbahn && plan.bmaSymbols.filter(s => s.symbol_type === 'kabelbahn' && isSymbolIncluded(s.symbol_type, options)).map((s) => {
                                    let points: Array<{ x_norm: number; y_norm: number }> = [];
                                    try {
                                        const parsed = JSON.parse(s.description || "{}");
                                        if (Array.isArray(parsed.points)) points = parsed.points;
                                    } catch {}
                                    if (points.length < 2) return null;

                                    const ladderWidth = 8;
                                    const rungStep = 18;

                                    return (
                                        <G key={`kb-tray-${s.id}`}>
                                            {points.slice(0, points.length - 1).map((p1, idx) => {
                                                const p2 = points[idx + 1];
                                                const x1 = mapX(p1.x_norm);
                                                const y1 = mapY(p1.y_norm);
                                                const x2 = mapX(p2.x_norm);
                                                const y2 = mapY(p2.y_norm);

                                                const dx = x2 - x1;
                                                const dy = y2 - y1;
                                                const len = Math.sqrt(dx * dx + dy * dy);
                                                if (len <= 0) return null;

                                                const nx = -dy / len;
                                                const ny = dx / len;

                                                const lx1 = Math.round(x1 + ladderWidth * nx);
                                                const ly1 = Math.round(y1 + ladderWidth * ny);
                                                const lx2 = Math.round(x2 + ladderWidth * nx);
                                                const ly2 = Math.round(y2 + ladderWidth * ny);

                                                const rx1 = Math.round(x1 - ladderWidth * nx);
                                                const ry1 = Math.round(y1 - ladderWidth * ny);
                                                const rx2 = Math.round(x2 - ladderWidth * nx);
                                                const ry2 = Math.round(y2 - ladderWidth * ny);

                                                const numRungs = Math.max(1, Math.floor(len / rungStep));
                                                const rungElements = [];

                                                for (let j = 0; j <= numRungs; j++) {
                                                    const dist = Math.min(len, j * rungStep);
                                                    const cx = x1 + (dist / len) * dx;
                                                    const cy = y1 + (dist / len) * dy;
                                                    const rungLx = Math.round(cx + ladderWidth * nx);
                                                    const rungLy = Math.round(cy + ladderWidth * ny);
                                                    const rungRx = Math.round(cx - ladderWidth * nx);
                                                    const rungRy = Math.round(cy - ladderWidth * ny);

                                                    rungElements.push(
                                                        <Line
                                                            key={`kb-rung-${s.id}-${idx}-${j}`}
                                                            x1={rungLx}
                                                            y1={rungLy}
                                                            x2={rungRx}
                                                            y2={rungRy}
                                                            stroke="#008000"
                                                            strokeWidth={1}
                                                        />
                                                    );
                                                }
                                                return (
                                                    <G key={`kb-seg-${s.id}-${idx}`}>
                                                        <Line x1={lx1} y1={ly1} x2={lx2} y2={ly2} stroke="#008000" strokeWidth={2} />
                                                        <Line x1={rx1} y1={ry1} x2={rx2} y2={ry2} stroke="#008000" strokeWidth={2} />
                                                        {rungElements}
                                                    </G>
                                                );
                                            })}
                                        </G>
                                    );
                                })}

                                {/* 4b. LED Stripe Vector Rectangles */}
                                {showLighting && plan.bmaSymbols.filter(s => s.symbol_type === 'led_stripe').map((s) => {
                                    let w_norm = 0.05;
                                    let h_norm = 0.02;
                                    try {
                                        const parsed = JSON.parse(s.description || "{}");
                                        if (typeof parsed.w_norm === 'number') w_norm = parsed.w_norm;
                                        if (typeof parsed.h_norm === 'number') h_norm = parsed.h_norm;
                                    } catch {}

                                    const rx = mapX(s.x_norm);
                                    const ry = mapY(s.y_norm);
                                    const rw = mapW(w_norm);
                                    const rh = mapH(h_norm);
                                    const midX = rx + Math.round(rw / 2);
                                    const midY = ry + Math.round(rh / 2);

                                    return (
                                        <G key={`led-stripe-${s.id}`}>
                                            <Rect
                                                x={rx}
                                                y={ry}
                                                width={rw}
                                                height={rh}
                                                fill="#fef08a"
                                                fillOpacity={0.35}
                                                stroke="#eab308"
                                                strokeWidth={2.5}
                                            />
                                            {s.label ? (
                                                <>
                                                    <SvgText
                                                        x={midX}
                                                        y={midY + 3}
                                                        fill="#ffffff"
                                                        stroke="#ffffff"
                                                        strokeWidth={3}
                                                        textAnchor="middle"
                                                        style={{ fontSize: 9, fontWeight: 'bold' }}
                                                    >
                                                        {s.label}
                                                    </SvgText>
                                                    <SvgText
                                                        x={midX}
                                                        y={midY + 3}
                                                        fill="#854d0e"
                                                        textAnchor="middle"
                                                        style={{ fontSize: 9, fontWeight: 'bold' }}
                                                    >
                                                        {s.label}
                                                    </SvgText>
                                                </>
                                            ) : null}
                                        </G>
                                    );
                                })}

                                {/* 6. Cable Connections & Free Lines — rendered ON TOP inside <Svg> so entire path is fully visible */}
                                {options.includeCables !== false && (plan.cableConnections ?? [] as any[]).map((c: any, cIdx: number) => {
                                    const m = c.metadata || {};
                                    const isFree = c.type === 'FREE_LINE' || m.is_free_line;
                                    const strokeColor = c.color || (isFree ? '#d97706' : '#1d4ed8');

                                    const pts = getPdfCablePointsForPlan(c, plan, mapX, mapY);
                                    if (!pts || pts.length < 2) return null;

                                    const anchoredPts: Array<{ x: number; y: number }> = [];
                                    if (pts.length === 2 && (Math.abs(pts[0].x - pts[1].x) > 4 || Math.abs(pts[0].y - pts[1].y) > 4)) {
                                        anchoredPts.push(...pts);
                                    } else {
                                        anchoredPts.push(...pts);
                                    }

                                    const dPath = anchoredPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${Math.round(p.x)} ${Math.round(p.y)}`).join(' ');

                                    const cNumUpper = (m.cable_number || c.name || '').toUpperCase();
                                    const cTypeLower = (m.cable_type || c.type || '').toLowerCase();
                                    const isPe = m.is_pe_line || c.type === 'PE_LINE' || cNumUpper.includes('PE') || cTypeLower.includes('potenzialausgleich') || cTypeLower.includes('pe') || strokeColor === '#16a34a' || strokeColor === '#22c55e';

                                    if (isPe) {
                                        const pLastPrev = anchoredPts[anchoredPts.length - 2];
                                        const pLast = anchoredPts[anchoredPts.length - 1];
                                        const angleRad = Math.atan2(pLast.y - pLastPrev.y, pLast.x - pLastPrev.x);
                                        const cos = Math.cos(angleRad);
                                        const sin = Math.sin(angleRad);

                                        const x = Math.round(pLast.x);
                                        const y = Math.round(pLast.y);

                                        // Arrowhead geometry pointing right at 0 deg: tip (0,0), (-14,-6), (-9,0), (-14,6)
                                        const x1 = Math.round(x - 14 * cos + 6 * sin);
                                        const y1 = Math.round(y - 14 * sin - 6 * cos);
                                        const x2 = Math.round(x - 9 * cos);
                                        const y2 = Math.round(y - 9 * sin);
                                        const x3 = Math.round(x - 14 * cos - 6 * sin);
                                        const y3 = Math.round(y - 14 * sin + 6 * cos);

                                        const arrowD = `M ${x} ${y} L ${x1} ${y1} L ${x2} ${y2} L ${x3} ${y3} Z`;

                                        return (
                                            <G key={`cable-line2-${c.id || cIdx}`}>
                                                {/* 1. Base Green Line */}
                                                <Path
                                                    d={dPath}
                                                    stroke="#16a34a"
                                                    strokeWidth={1.6}
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    fill="none"
                                                />
                                                {/* 2. Overlay Dashed Yellow Line */}
                                                <Path
                                                    d={dPath}
                                                    stroke="#facc15"
                                                    strokeWidth={0.9}
                                                    strokeDasharray="6,4"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    fill="none"
                                                />
                                                {/* 3. Green Arrowhead at end tip with Yellow Stroke */}
                                                <Path
                                                    d={arrowD}
                                                    fill="#16a34a"
                                                    stroke="#facc15"
                                                    strokeWidth={0.8}
                                                    strokeLinejoin="round"
                                                />
                                            </G>
                                        );
                                    }

                                    return (
                                        <G key={`cable-line2-${c.id || cIdx}`}>
                                            <Path
                                                d={dPath}
                                                stroke={strokeColor}
                                                strokeWidth={1.2}
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeDasharray={isFree ? '5,3' : undefined}
                                                fill="none"
                                            />
                                        </G>
                                    );
                                })}

                                {/* 4.6. Custom Device Boxes (Geräte / Steuerung) */}
                                {plan.bmaSymbols.filter(s => isSymbolIncluded(s.symbol_type, options) && s.symbol_type === 'geraet_box').map((s) => {
                                    let w_norm = 0.015;
                                    let h_norm = 0.006;
                                    try {
                                        const pObj = JSON.parse(s.description || '{}');
                                        const scale = typeof pObj.scale === 'number' ? pObj.scale : (pObj.isSmall || pObj.geraetSize === 'small' ? 0.5 : 1.0);
                                        if (typeof pObj.w_norm === 'number' && typeof pObj.h_norm === 'number') {
                                            w_norm = pObj.w_norm;
                                            h_norm = pObj.h_norm;
                                        } else if (pObj.orientation === 'senkrecht' || pObj.direction === 'senkrecht' || pObj.direction === 'down' || pObj.direction === 'up') {
                                            w_norm = 0.0036 * scale; h_norm = 0.025 * scale;
                                        } else {
                                            w_norm = 0.015 * scale; h_norm = 0.006 * scale;
                                        }
                                    } catch {}

                                    let variantColor = '#0284c7';
                                    let powerKw = '';
                                    try {
                                        const parsed = JSON.parse(s.description || '{}');
                                        if (typeof parsed.w_norm === 'number') w_norm = parsed.w_norm;
                                        if (typeof parsed.h_norm === 'number') h_norm = parsed.h_norm;
                                        if (parsed.powerKw) powerKw = parsed.powerKw;
                                        if (plan.lampTypes?.variants) {
                                            const found = plan.lampTypes.variants.find((v: any) => v.id === parsed.variantId || v.name === parsed.variantName);
                                            if (found && found.color) variantColor = found.color;
                                        }
                                        if (!variantColor && parsed.variantColor) variantColor = parsed.variantColor;
                                    } catch {}

                                    const rx = mapX(s.x_norm);
                                    const ry = mapY(s.y_norm);
                                    const rw = mapW(w_norm);
                                    const rh = mapH(h_norm);
                                    const midX = rx + Math.round(rw / 2);
                                    const midY = ry + Math.round(rh / 2);
                                    const labelText = s.label ? `${s.label}${powerKw ? ' (' + (powerKw.includes('kW') ? powerKw : powerKw + ' kW') + ')' : ''}` : '';

                                    return (
                                        <G key={`geraet-${s.id}`}>
                                            <Rect
                                                x={rx}
                                                y={ry}
                                                width={rw}
                                                height={rh}
                                                fill={variantColor}
                                                fillOpacity={0.25}
                                                stroke={variantColor}
                                                strokeWidth={2}
                                                rx={4}
                                            />
                                            {labelText ? (
                                                <>
                                                    <SvgText
                                                        x={midX}
                                                        y={midY + 3}
                                                        fill="#ffffff"
                                                        stroke="#ffffff"
                                                        strokeWidth={3}
                                                        textAnchor="middle"
                                                        style={{ fontSize: 9, fontWeight: 'bold' }}
                                                    >
                                                        {labelText}
                                                    </SvgText>
                                                    <SvgText
                                                        x={midX}
                                                        y={midY + 3}
                                                        fill="#0f172a"
                                                        textAnchor="middle"
                                                        style={{ fontSize: 9, fontWeight: 'bold' }}
                                                    >
                                                        {labelText}
                                                    </SvgText>
                                                </>
                                            ) : null}
                                        </G>
                                    );
                                })}

                                 {/* 5. Deconflicted Anti-Collision Label Badges (Clean text without rectangular frames) */}

                                {deconflictedLabels.map((lbl) => {
                                    const badgeStrokeColor = getSymbolCategoryColor(lbl.symbol_type, lbl.variantColor);
                                    const leaderLineStroke = badgeStrokeColor;
                                    const isBmaDetector = lbl.symbol_type === 'detector_red' || lbl.symbol_type === 'detector_blue' || lbl.symbol_type === 'dis_signalgeber' || lbl.symbol_type === 'sirene';
                                    const textColor = isBmaDetector ? badgeStrokeColor : (lbl.variantColor || badgeStrokeColor || '#000000');

                                    return (
                                        <G key={`lbl-${lbl.symbolId}`}>
                                            {/* Dashed leader line if label was offset to avoid overlapping */}
                                            {lbl.hasLeaderLine && (
                                                <Line
                                                    x1={lbl.iconCenterX}
                                                    y1={lbl.iconCenterY}
                                                    x2={lbl.badgeX + lbl.badgeW / 2}
                                                    y2={lbl.badgeY + lbl.badgeH / 2}
                                                    stroke={leaderLineStroke}
                                                    strokeWidth={1.5}
                                                    strokeDasharray="4,3"
                                                    strokeOpacity={0.85}
                                                />
                                            )}
                                            {/* Clean readable text without rectangular frame */}
                                            <SvgText
                                                x={lbl.textX}
                                                y={lbl.textY}
                                                fill={textColor}
                                                textAnchor="middle"
                                                style={{ fontSize: isBmaDetector ? 16.5 : 13, fontWeight: 'normal' }}
                                            >
                                                {lbl.text}
                                            </SvgText>
                                        </G>
                                    );
                                })}

                            </Svg>

                            {/* ── EXACT BMA, HEATING & NOTBELEUCHTUNG SYMBOL ICONS (with Uniform Category / Variant Colored Ring) ── */}
                            {plan.bmaSymbols.filter(s => isSymbolIncluded(s.symbol_type, options) && s.symbol_type !== 'kabelbahn' && s.symbol_type !== 'led_stripe' && s.symbol_type !== 'geraet_box' && s.symbol_type !== 'revision_cloud' && s.symbol_type !== 'abdeckung_box').map((s) => {
                                const cx = mapX(s.x_norm);
                                const cy = mapY(s.y_norm);
                                const isGross = s.symbol_type === 'notlicht_pikto_gross';
                                const isKlein = s.symbol_type === 'notlicht_pikto';
                                const isDis = s.symbol_type === 'dis_signalgeber';
                                const isWpAussen = s.symbol_type === 'warmepumpe_aussen';
                                const isWpInnen = s.symbol_type === 'warmepumpe_innen';
                                const isInfra = s.symbol_type === 'infrarotheizung';
                                const isFuehler = s.symbol_type === 'temperaturfuehler';
                                const isUeberspannung = s.symbol_type === 'ueberspannungsschutz';

                                const isInfraSenkrecht = (() => {
                                    try {
                                        const pObj = JSON.parse(s.description || '{}');
                                        return pObj.orientation === 'senkrecht' || pObj.direction === 'senkrecht' || pObj.direction === 'down' || pObj.direction === 'up';
                                    } catch { return false; }
                                })();
                                const iconW = isGross ? 26 : isDis ? 34 : isWpAussen ? 30 : isWpInnen ? 45 : isFuehler ? 32 : isUeberspannung ? 24 : isInfra ? (isInfraSenkrecht ? 20 : 60) : BMA_SIZE;
                                const iconH = isGross ? 13 : isDis ? 22 : isWpAussen ? 60 : isWpInnen ? 45 : isFuehler ? 32 : isUeberspannung ? 28 : isInfra ? (isInfraSenkrecht ? 60 : 20) : BMA_SIZE;

                                const iconSrc = (isGross || isKlein || s.symbol_type === 'sirene')
                                    ? getPiktoBase64(s.symbol_type, getPiktoDirection(s.description))
                                    : (BMA_ICONS_BASE64[s.symbol_type] || BMA_ICONS_BASE64['detector_blue']);
                                if (!iconSrc) return null;

                                let variantColor: string | null = null;
                                if (s.description) {
                                    try {
                                        const parsed = JSON.parse(s.description);
                                        if (plan.lampTypes?.variants && plan.lampTypes.variants.length > 0) {
                                            const isHeating = s.symbol_type === 'warmepumpe_aussen' || s.symbol_type === 'warmepumpe_innen' || s.symbol_type === 'infrarotheizung' || s.symbol_type === 'geraet_box';
                                            const found = plan.lampTypes.variants.find((v: any) => {
                                                const vIsHeating = v.category === 'warmepumpe_aussen' || v.category === 'warmepumpe_innen' || v.category === 'infrarotheizung' || v.category === 'geraet_box';
                                                if (isHeating !== vIsHeating) return false;
                                                if (v.category && v.category !== s.symbol_type && !(v.category === 'geraet_box' && s.symbol_type === 'geraet_box')) return false;
                                                if (parsed.variantId && v.id === parsed.variantId) return true;
                                                if (parsed.variantName && v.name === parsed.variantName) return true;
                                                return false;
                                            });
                                            if (found && found.color) variantColor = found.color;
                                        }
                                        if (!variantColor && parsed.variantColor && parsed.variantId) variantColor = parsed.variantColor;
                                    } catch {}
                                }

                                const isStandardBma = s.symbol_type === 'detector_red' || s.symbol_type === 'detector_blue' || s.symbol_type === 'dis_signalgeber' || s.symbol_type === 'sirene' || s.symbol_type === 'ueberspannungsschutz' || s.symbol_type === 'kabelauslass' || s.symbol_type === 'lampe';
                                const ringColor = (isStandardBma && !variantColor) ? null : getSymbolCategoryColor(s.symbol_type, variantColor);

                                return (
                                    <React.Fragment key={s.id}>
                                        {ringColor && (
                                            <View
                                                style={{
                                                    position: 'absolute',
                                                    left: Math.round(cx - iconW / 2 - 3),
                                                    top: Math.round(cy - iconH / 2 - 3),
                                                    width: iconW + 6,
                                                    height: iconH + 6,
                                                    borderRadius: 4,
                                                    borderWidth: 2,
                                                    borderColor: ringColor,
                                                    backgroundColor: '#ffffff',
                                                }}
                                            />
                                        )}
                                        <View
                                            style={{
                                                position: 'absolute',
                                                left: Math.round(cx - iconW / 2),
                                                top: Math.round(cy - iconH / 2),
                                                width: iconW,
                                                height: iconH,
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                            }}
                                        >
                                            <Image
                                                src={iconSrc && typeof iconSrc === 'string' && iconSrc.startsWith('data:image') ? iconSrc : BMA_ICONS_BASE64['detector_blue']}
                                                style={{
                                                    width: (isInfra && isInfraSenkrecht) ? iconH : iconW,
                                                    height: (isInfra && isInfraSenkrecht) ? iconW : iconH,
                                                    opacity: 0.95,
                                                    objectFit: 'contain',
                                                    transform: (isInfra && isInfraSenkrecht) ? 'rotate(90deg)' : undefined,
                                                }}
                                            />
                                        </View>
                                    </React.Fragment>
                                );
                            })}

                            {/* Photo Pin (Generic) Number Badges */}
                            {options.includePhotoPins && (plan.photoPins || []).map((p, idx) => {
                                const cx = mapX(p.x_norm);
                                const cy = mapY(p.y_norm);
                                return (
                                    <View
                                        key={`photo-badge-${p.id}`}
                                        style={{
                                            position: 'absolute',
                                            left: Math.round(cx - PIN_R),
                                            top: Math.round(cy - PIN_R),
                                            width: PIN_R * 2,
                                            height: PIN_R * 2,
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        <Text style={{ fontSize: PIN_FONT - 1, color: '#ffffff', fontWeight: 'bold' }}>
                                            {`F${idx + 1}`}
                                        </Text>
                                    </View>
                                );
                            })}

                            {/* Montage-Doku Number Badges */}
                            {options.includeMontageDoku && (plan.montagePins || []).map((p, idx) => {
                                const cx = mapX(p.x_norm);
                                const cy = mapY(p.y_norm);
                                const r = PIN_R * 1.15;
                                return (
                                    <View
                                        key={`montage-badge-${p.id}`}
                                        style={{
                                            position: 'absolute',
                                            left: Math.round(cx - r),
                                            top: Math.round(cy - r),
                                            width: r * 2,
                                            height: r * 2,
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        <Text style={{ fontSize: PIN_FONT - 1.5, color: '#fef08a', fontWeight: 'bold' }}>
                                            {`MD${idx + 1}`}
                                        </Text>
                                    </View>
                                );
                            })}

                            {/* Beschädigung Number Badges */}
                            {options.includeDamage && (plan.damagePins || []).map((p, idx) => {
                                const cx = mapX(p.x_norm);
                                const cy = mapY(p.y_norm);
                                const r = PIN_R * 1.15;
                                return (
                                    <View
                                        key={`damage-badge-${p.id}`}
                                        style={{
                                            position: 'absolute',
                                            left: Math.round(cx - r),
                                            top: Math.round(cy - r),
                                            width: r * 2,
                                            height: r * 2,
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        <Text style={{ fontSize: PIN_FONT - 1.5, color: '#ffffff', fontWeight: 'bold' }}>
                                            {`B${idx + 1}`}
                                        </Text>
                                    </View>
                                );
                            })}

                            {/* CABLE NUMBER BADGES: Absolute View rendered LAST — always on top of device icons */}
                            {options.includeCables !== false && deconflictedCableBadges.map((b) => (
                                <View
                                    key={`cabl-badge-${b.id}`}
                                    style={{
                                        position: 'absolute',
                                        left: b.finalX,
                                        top: b.finalY,
                                        width: Math.round(b.bw),
                                        height: Math.round(b.bh),
                                        backgroundColor: '#ffffff',
                                        borderRadius: 2,
                                        borderWidth: 1,
                                        borderColor: b.borderColor,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    <Text style={{ fontSize: 7, color: b.borderColor, fontWeight: 'bold' }}>
                                        {b.cableNum}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    </Page>
                );
            })}

            {/* ── DEDICATED LEUCHTENTYPEN-KATALOG & SPEZIFIKATION PAGE (When Lamp Types are included) ── */}
            {options.includeLampTypes === true && (showNotlicht || options.includeHeating === true) && (() => {
                const reserveCountPerKreis = options.reservePerKreis || 0;
                const allAufkleber = extractAndSortAufkleberItems(plansData, reserveCountPerKreis, options);
                const realAufkleber = allAufkleber.filter(a => !a.isReserve);
                if (realAufkleber.length === 0) return null;

                const totalCount = realAufkleber.length;
                const lampenCount = realAufkleber.filter(a => a.symbol_type === 'notlicht_lampe').length;
                const piktoKleinCount = realAufkleber.filter(a => a.symbol_type === 'notlicht_pikto').length;
                const piktoGrossCount = realAufkleber.filter(a => a.symbol_type === 'notlicht_pikto_gross').length;
                const wpAussenCount = realAufkleber.filter(a => a.symbol_type === 'warmepumpe_aussen').length;
                const wpInnenCount = realAufkleber.filter(a => a.symbol_type === 'warmepumpe_innen').length;
                const infraCount = realAufkleber.filter(a => a.symbol_type === 'infrarotheizung').length;
                const geraetBoxCount = realAufkleber.filter(a => a.symbol_type === 'geraet_box').length;
                const totalReserveCount = allAufkleber.filter(a => a.isReserve).length;

                // Group by Kreis
                const kreisMap = new Map<string, typeof allAufkleber>();
                for (const item of realAufkleber) {
                    const k = item.rawLoop || '1';
                    if (!kreisMap.has(k)) kreisMap.set(k, []);
                    kreisMap.get(k)!.push(item);
                }

                const combinedLampTypes: Record<string, { model?: string; photoBase64?: string; photoUrl?: string; notes?: string }> = {};
                const allVariants: Array<{
                    id: string;
                    category: string;
                    name: string;
                    model: string;
                    color: string;
                    notes?: string;
                    photoBase64?: string;
                }> = [];

                for (const p of plansData) {
                    if (p.lampTypes) {
                        for (const [k, v] of Object.entries(p.lampTypes)) {
                            if (k === 'variants' && Array.isArray(v)) {
                                for (const varItem of v as any[]) {
                                    if (!allVariants.find(av => av.id === varItem.id || (av.name === varItem.name && av.color === varItem.color))) {
                                        allVariants.push(varItem);
                                    }
                                }
                            } else if (typeof v === 'object' && v !== null) {
                                if (!combinedLampTypes[k] || (!combinedLampTypes[k].photoBase64 && (v as any).photoBase64)) {
                                    combinedLampTypes[k] = { ...combinedLampTypes[k], ...(v as any) };
                                }
                            }
                        }
                    }
                }

                // Build variant groups with their assigned sticker numbers (ONLY active on these plans)
                type VariantGroupDisplay = {
                    id: string;
                    title: string;
                    model: string;
                    color: string;
                    photoBase64?: string;
                    notes?: string;
                    count: number;
                    stickerNumbers: string[];
                    iconKey: string;
                    isHeating?: boolean;
                    zuleitung?: string;
                    powerKw?: string;
                };

                const variantGroups: VariantGroupDisplay[] = [];

                if (allVariants.length > 0) {
                    for (const v of allVariants) {
                        const isHeatingCategory = v.category === 'warmepumpe_aussen' || v.category === 'warmepumpe_innen' || v.category === 'infrarotheizung' || v.category === 'geraet_box';
                        const matched = allAufkleber.filter(a => {
                            if (a.isReserve) return false;
                            if (isHeatingCategory) {
                                if (a.symbol_type !== v.category) return false;
                            } else {
                                if (a.symbol_type !== 'notlicht_lampe' && a.symbol_type !== 'notlicht_pikto' && a.symbol_type !== 'notlicht_pikto_gross' && a.symbol_type !== 'lampe') return false;
                            }
                            if (a.variantId && a.variantId === v.id) return true;
                            if (a.variantName && a.variantName === v.name) return true;
                            return false;
                        });
                        if (matched.length > 0) {
                            variantGroups.push({
                                id: v.id,
                                title: v.name,
                                model: v.model || (v.category === 'warmepumpe_aussen' ? 'Wärmepumpe Außen' : v.category === 'warmepumpe_innen' ? 'Wärmepumpe Innen' : v.category === 'infrarotheizung' ? 'Infrarotheizung' : v.category === 'geraet_box' ? 'Gerät / Steuerung' : 'Sicherheitsleuchte'),
                                color: v.color || '#16a34a',
                                photoBase64: v.photoBase64 || (v as any).photoUrl,
                                notes: v.notes,
                                count: matched.length,
                                stickerNumbers: matched.map(m => m.label),
                                iconKey: v.category || 'notlicht_lampe',
                                isHeating: v.category === 'warmepumpe_aussen' || v.category === 'warmepumpe_innen' || v.category === 'infrarotheizung' || v.category === 'geraet_box',
                                powerKw: matched.find(m => m.powerKw)?.powerKw || (v as any).powerKw,
                                zuleitung: matched.find(m => m.zuleitung)?.zuleitung || (v as any).zuleitung,
                            });
                        }
                    }

                    // Check if there are any remaining unassigned emergency/heating symbols per category
                    const unassignedLampe = allAufkleber.filter(a => !a.isReserve && !a.variantId && !a.variantName && a.symbol_type === 'notlicht_lampe');
                    if (unassignedLampe.length > 0) {
                        variantGroups.push({
                            id: 'standard-lampe',
                            title: 'Notbeleuchtung Lampe (Standard)',
                            model: combinedLampTypes.notlicht_lampe?.model || 'Sicherheitsleuchte Notlicht',
                            color: '#16a34a',
                            photoBase64: combinedLampTypes.notlicht_lampe?.photoBase64,
                            notes: combinedLampTypes.notlicht_lampe?.notes,
                            count: unassignedLampe.length,
                            stickerNumbers: unassignedLampe.map(m => m.label),
                            iconKey: 'notlicht_lampe',
                        });
                    }

                    const unassignedPiktoKlein = allAufkleber.filter(a => !a.isReserve && !a.variantId && !a.variantName && a.symbol_type === 'notlicht_pikto');
                    if (unassignedPiktoKlein.length > 0) {
                        variantGroups.push({
                            id: 'standard-pikto-klein',
                            title: 'Rettungszeichen klein (RZ-K) - Standard',
                            model: combinedLampTypes.notlicht_pikto?.model || 'Rettungszeichenleuchte klein',
                            color: '#15803d',
                            photoBase64: combinedLampTypes.notlicht_pikto?.photoBase64,
                            notes: combinedLampTypes.notlicht_pikto?.notes,
                            count: unassignedPiktoKlein.length,
                            stickerNumbers: unassignedPiktoKlein.map(m => m.label),
                            iconKey: 'notlicht_pikto',
                        });
                    }

                    const unassignedPiktoGross = allAufkleber.filter(a => !a.isReserve && !a.variantId && !a.variantName && a.symbol_type === 'notlicht_pikto_gross');
                    if (unassignedPiktoGross.length > 0) {
                        variantGroups.push({
                            id: 'standard-pikto-gross',
                            title: 'Rettungszeichen groß (RZ-G) - Standard',
                            model: combinedLampTypes.notlicht_pikto_gross?.model || 'Rettungszeichenleuchte groß',
                            color: '#047857',
                            photoBase64: combinedLampTypes.notlicht_pikto_gross?.photoBase64,
                            notes: combinedLampTypes.notlicht_pikto_gross?.notes,
                            count: unassignedPiktoGross.length,
                            stickerNumbers: unassignedPiktoGross.map(m => m.label),
                            iconKey: 'notlicht_pikto_gross',
                        });
                    }

                    const unassignedWpAussen = allAufkleber.filter(a => !a.isReserve && !a.variantId && !a.variantName && a.symbol_type === 'warmepumpe_aussen');
                    if (unassignedWpAussen.length > 0) {
                        variantGroups.push({
                            id: 'standard-wp-aussen',
                            title: 'Wärmepumpe Außen',
                            model: combinedLampTypes.warmepumpe_aussen?.model || 'Wärmepumpe Außeneinheit',
                            color: '#0284c7',
                            photoBase64: combinedLampTypes.warmepumpe_aussen?.photoBase64,
                            notes: combinedLampTypes.warmepumpe_aussen?.notes,
                            count: unassignedWpAussen.length,
                            stickerNumbers: unassignedWpAussen.map(m => m.label),
                            iconKey: 'warmepumpe_aussen',
                            isHeating: true,
                            powerKw: unassignedWpAussen.find(m => m.powerKw)?.powerKw || (combinedLampTypes.warmepumpe_aussen as any)?.powerKw,
                            zuleitung: unassignedWpAussen.find(m => m.zuleitung)?.zuleitung || (combinedLampTypes.warmepumpe_aussen as any)?.zuleitung,
                        });
                    }

                    const unassignedWpInnen = allAufkleber.filter(a => !a.isReserve && !a.variantId && !a.variantName && a.symbol_type === 'warmepumpe_innen');
                    if (unassignedWpInnen.length > 0) {
                        variantGroups.push({
                            id: 'standard-wp-innen',
                            title: 'Wärmepumpe Innen',
                            model: combinedLampTypes.warmepumpe_innen?.model || 'Wärmepumpe Inneneinheit',
                            color: '#0ea5e9',
                            photoBase64: combinedLampTypes.warmepumpe_innen?.photoBase64,
                            notes: combinedLampTypes.warmepumpe_innen?.notes,
                            count: unassignedWpInnen.length,
                            stickerNumbers: unassignedWpInnen.map(m => m.label),
                            iconKey: 'warmepumpe_innen',
                            isHeating: true,
                            powerKw: unassignedWpInnen.find(m => m.powerKw)?.powerKw || (combinedLampTypes.warmepumpe_innen as any)?.powerKw,
                            zuleitung: unassignedWpInnen.find(m => m.zuleitung)?.zuleitung || (combinedLampTypes.warmepumpe_innen as any)?.zuleitung,
                        });
                    }

                    const unassignedInfra = allAufkleber.filter(a => !a.isReserve && !a.variantId && !a.variantName && a.symbol_type === 'infrarotheizung');
                    if (unassignedInfra.length > 0) {
                        variantGroups.push({
                            id: 'standard-infrarotheizung',
                            title: 'Infrarotheizung',
                            model: combinedLampTypes.infrarotheizung?.model || 'Infrarotheizung Paneel',
                            color: '#ea580c',
                            photoBase64: combinedLampTypes.infrarotheizung?.photoBase64,
                            notes: combinedLampTypes.infrarotheizung?.notes,
                            count: unassignedInfra.length,
                            stickerNumbers: unassignedInfra.map(m => m.label),
                            iconKey: 'infrarotheizung',
                            isHeating: true,
                            powerKw: unassignedInfra.find(m => m.powerKw)?.powerKw || (combinedLampTypes.infrarotheizung as any)?.powerKw,
                            zuleitung: unassignedInfra.find(m => m.zuleitung)?.zuleitung || (combinedLampTypes.infrarotheizung as any)?.zuleitung,
                        });
                    }

                    const unassignedGeraet = allAufkleber.filter(a => !a.isReserve && !a.variantId && !a.variantName && a.symbol_type === 'geraet_box');
                    if (unassignedGeraet.length > 0) {
                        variantGroups.push({
                            id: 'standard-geraet-box',
                            title: 'Sonstige Geräte / Steuerung',
                            model: combinedLampTypes.geraet_box?.model || 'Steuerung / Schaltgerät',
                            color: '#0284c7',
                            photoBase64: combinedLampTypes.geraet_box?.photoBase64,
                            notes: combinedLampTypes.geraet_box?.notes,
                            count: unassignedGeraet.length,
                            stickerNumbers: unassignedGeraet.map(m => m.label),
                            iconKey: 'geraet_box',
                            isHeating: true,
                            powerKw: unassignedGeraet.find(m => m.powerKw)?.powerKw || (combinedLampTypes.geraet_box as any)?.powerKw,
                            zuleitung: unassignedGeraet.find(m => m.zuleitung)?.zuleitung || (combinedLampTypes.geraet_box as any)?.zuleitung,
                        });
                    }
                } else {
                    // Default categories if no custom variants - ONLY if count > 0
                    if (lampenCount > 0) {
                        const matched = allAufkleber.filter(a => !a.isReserve && a.symbol_type === 'notlicht_lampe');
                        variantGroups.push({
                            id: 'notlicht_lampe',
                            title: 'Notbeleuchtung Lampe',
                            model: combinedLampTypes.notlicht_lampe?.model || 'Sicherheitsleuchte Notlicht',
                            color: '#16a34a',
                            photoBase64: combinedLampTypes.notlicht_lampe?.photoBase64,
                            notes: combinedLampTypes.notlicht_lampe?.notes,
                            count: lampenCount,
                            stickerNumbers: matched.map(m => m.label),
                            iconKey: 'notlicht_lampe',
                        });
                    }
                    if (piktoKleinCount > 0) {
                        const matched = allAufkleber.filter(a => !a.isReserve && a.symbol_type === 'notlicht_pikto');
                        variantGroups.push({
                            id: 'notlicht_pikto',
                            title: 'Rettungszeichen klein (RZ-K)',
                            model: combinedLampTypes.notlicht_pikto?.model || 'Rettungszeichenleuchte klein',
                            color: '#15803d',
                            photoBase64: combinedLampTypes.notlicht_pikto?.photoBase64,
                            notes: combinedLampTypes.notlicht_pikto?.notes,
                            count: piktoKleinCount,
                            stickerNumbers: matched.map(m => m.label),
                            iconKey: 'notlicht_pikto',
                        });
                    }
                    if (piktoGrossCount > 0) {
                        const matched = allAufkleber.filter(a => !a.isReserve && a.symbol_type === 'notlicht_pikto_gross');
                        variantGroups.push({
                            id: 'notlicht_pikto_gross',
                            title: 'Rettungszeichen groß (RZ-G)',
                            model: combinedLampTypes.notlicht_pikto_gross?.model || 'Rettungszeichenleuchte groß',
                            color: '#047857',
                            photoBase64: combinedLampTypes.notlicht_pikto_gross?.photoBase64,
                            notes: combinedLampTypes.notlicht_pikto_gross?.notes,
                            count: piktoGrossCount,
                            stickerNumbers: matched.map(m => m.label),
                            iconKey: 'notlicht_pikto_gross',
                        });
                    }
                    if (wpAussenCount > 0) {
                        const matched = allAufkleber.filter(a => !a.isReserve && a.symbol_type === 'warmepumpe_aussen');
                        variantGroups.push({
                            id: 'warmepumpe_aussen',
                            title: 'Wärmepumpe Außen',
                            model: combinedLampTypes.warmepumpe_aussen?.model || 'Wärmepumpe Außeneinheit',
                            color: '#0284c7',
                            photoBase64: combinedLampTypes.warmepumpe_aussen?.photoBase64,
                            notes: combinedLampTypes.warmepumpe_aussen?.notes,
                            count: wpAussenCount,
                            stickerNumbers: matched.map(m => m.label),
                            iconKey: 'warmepumpe_aussen',
                            isHeating: true,
                            powerKw: matched.find(m => m.powerKw)?.powerKw || (combinedLampTypes.warmepumpe_aussen as any)?.powerKw,
                            zuleitung: matched.find(m => m.zuleitung)?.zuleitung || (combinedLampTypes.warmepumpe_aussen as any)?.zuleitung,
                        });
                    }
                    if (wpInnenCount > 0) {
                        const matched = allAufkleber.filter(a => !a.isReserve && a.symbol_type === 'warmepumpe_innen');
                        variantGroups.push({
                            id: 'warmepumpe_innen',
                            title: 'Wärmepumpe Innen',
                            model: combinedLampTypes.warmepumpe_innen?.model || 'Wärmepumpe Inneneinheit',
                            color: '#0ea5e9',
                            photoBase64: combinedLampTypes.warmepumpe_innen?.photoBase64,
                            notes: combinedLampTypes.warmepumpe_innen?.notes,
                            count: wpInnenCount,
                            stickerNumbers: matched.map(m => m.label),
                            iconKey: 'warmepumpe_innen',
                            isHeating: true,
                            powerKw: matched.find(m => m.powerKw)?.powerKw || (combinedLampTypes.warmepumpe_innen as any)?.powerKw,
                            zuleitung: matched.find(m => m.zuleitung)?.zuleitung || (combinedLampTypes.warmepumpe_innen as any)?.zuleitung,
                        });
                    }
                    if (infraCount > 0) {
                        const matched = allAufkleber.filter(a => !a.isReserve && a.symbol_type === 'infrarotheizung');
                        variantGroups.push({
                            id: 'infrarotheizung',
                            title: 'Infrarotheizung',
                            model: combinedLampTypes.infrarotheizung?.model || 'Infrarotheizung Paneel',
                            color: '#ea580c',
                            photoBase64: combinedLampTypes.infrarotheizung?.photoBase64,
                            notes: combinedLampTypes.infrarotheizung?.notes,
                            count: infraCount,
                            stickerNumbers: matched.map(m => m.label),
                            iconKey: 'infrarotheizung',
                            isHeating: true,
                            powerKw: matched.find(m => m.powerKw)?.powerKw || (combinedLampTypes.infrarotheizung as any)?.powerKw,
                            zuleitung: matched.find(m => m.zuleitung)?.zuleitung || (combinedLampTypes.infrarotheizung as any)?.zuleitung,
                        });
                    }
                    if (geraetBoxCount > 0) {
                        const matched = allAufkleber.filter(a => !a.isReserve && a.symbol_type === 'geraet_box');
                        variantGroups.push({
                            id: 'geraet_box',
                            title: 'Sonstige Geräte / Steuerung',
                            model: combinedLampTypes.geraet_box?.model || 'Steuerung / Schaltgerät',
                            color: '#0284c7',
                            photoBase64: combinedLampTypes.geraet_box?.photoBase64,
                            notes: combinedLampTypes.geraet_box?.notes,
                            count: geraetBoxCount,
                            stickerNumbers: matched.map(m => m.label),
                            iconKey: 'geraet_box',
                            isHeating: true,
                            powerKw: matched.find(m => m.powerKw)?.powerKw || (combinedLampTypes.geraet_box as any)?.powerKw,
                            zuleitung: matched.find(m => m.zuleitung)?.zuleitung || (combinedLampTypes.geraet_box as any)?.zuleitung,
                        });
                    }
                }

                const activeVariantGroups = variantGroups.filter(g => g.count > 0);
                if (activeVariantGroups.length === 0) return null;

                return (
                    <Page
                        key="leuchtentypen-katalog-page"
                        size="A0"
                        orientation="landscape"
                        style={[styles.page, { padding: 28, backgroundColor: '#f8fafc' }]}
                        wrap={false}
                    >
                        {/* Header Bar */}
                        <View style={[styles.header, { height: 50, backgroundColor: '#0f172a', paddingHorizontal: 20, marginBottom: 20 }]}>
                            <View style={styles.headerLeft}>
                                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#4ade80' }}>
                                    {!showNotlicht && options.includeHeating ? 'HEIZUNG & WÄRMEPUMPEN – GERÄTEKATALOG' : showNotlicht && !options.includeHeating ? 'NOTBELEUCHTUNG & RETTUNGSZEICHEN – LEUCHTENTYPEN-KATALOG' : 'NOTBELEUCHTUNG, HEIZUNG & RETTUNGSZEICHEN – GERÄTE- & LEUCHTENTYPEN-KATALOG'}
                                </Text>
                                <Text style={styles.headerDivider}>|</Text>
                                <Text style={styles.headerProject}>
                                    {translations.project || 'Projekt'}: <Text style={styles.headerProjectName}>{projectName}</Text>
                                </Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                <Text style={{ fontSize: 13, color: '#94a3b8' }}>
                                    {translations.generatedOn || 'Erstellt am'}: {new Date().toLocaleDateString()}
                                </Text>
                            </View>
                        </View>

                        {/* Top Counters Banner */}
                        <View style={{ flexDirection: 'row', gap: 14, marginBottom: 20 }}>
                            <View style={{ flex: 1, backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#16a34a', borderRadius: 8, padding: 14, alignItems: 'center' }}>
                                <Text style={{ fontSize: 12, color: '#166534', fontWeight: 'bold', textTransform: 'uppercase' }}>Gesamtanzahl Geräte & Leuchten</Text>
                                <Text style={{ fontSize: 28, fontWeight: 'black', color: '#15803d', marginTop: 3 }}>{totalCount} Stück</Text>
                            </View>
                            {lampenCount > 0 && (
                                <View style={{ flex: 1, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 14, alignItems: 'center' }}>
                                    <Text style={{ fontSize: 12, color: '#475569', fontWeight: 'bold', textTransform: 'uppercase' }}>Notlicht-Lampen</Text>
                                    <Text style={{ fontSize: 26, fontWeight: 'black', color: '#0f172a', marginTop: 3 }}>{lampenCount} Stk.</Text>
                                </View>
                            )}
                            {piktoKleinCount > 0 && (
                                <View style={{ flex: 1, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 14, alignItems: 'center' }}>
                                    <Text style={{ fontSize: 12, color: '#475569', fontWeight: 'bold', textTransform: 'uppercase' }}>Rettungszeichen klein (RZ-K)</Text>
                                    <Text style={{ fontSize: 26, fontWeight: 'black', color: '#0f172a', marginTop: 3 }}>{piktoKleinCount} Stk.</Text>
                                </View>
                            )}
                            {piktoGrossCount > 0 && (
                                <View style={{ flex: 1, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 14, alignItems: 'center' }}>
                                    <Text style={{ fontSize: 12, color: '#475569', fontWeight: 'bold', textTransform: 'uppercase' }}>Rettungszeichen groß (RZ-G)</Text>
                                    <Text style={{ fontSize: 26, fontWeight: 'black', color: '#0f172a', marginTop: 3 }}>{piktoGrossCount} Stk.</Text>
                                </View>
                            )}
                            {wpAussenCount > 0 && (
                                <View style={{ flex: 1, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#0284c7', borderRadius: 8, padding: 14, alignItems: 'center' }}>
                                    <Text style={{ fontSize: 12, color: '#0369a1', fontWeight: 'bold', textTransform: 'uppercase' }}>Wärmepumpen Außen</Text>
                                    <Text style={{ fontSize: 26, fontWeight: 'black', color: '#0284c7', marginTop: 3 }}>{wpAussenCount} Stk.</Text>
                                </View>
                            )}
                            {wpInnenCount > 0 && (
                                <View style={{ flex: 1, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#0ea5e9', borderRadius: 8, padding: 14, alignItems: 'center' }}>
                                    <Text style={{ fontSize: 12, color: '#0284c7', fontWeight: 'bold', textTransform: 'uppercase' }}>Wärmepumpen Innen</Text>
                                    <Text style={{ fontSize: 26, fontWeight: 'black', color: '#0ea5e9', marginTop: 3 }}>{wpInnenCount} Stk.</Text>
                                </View>
                            )}
                            {infraCount > 0 && (
                                <View style={{ flex: 1, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#f97316', borderRadius: 8, padding: 14, alignItems: 'center' }}>
                                    <Text style={{ fontSize: 12, color: '#c2410c', fontWeight: 'bold', textTransform: 'uppercase' }}>Infrarotheizungen</Text>
                                    <Text style={{ fontSize: 26, fontWeight: 'black', color: '#ea580c', marginTop: 3 }}>{infraCount} Stk.</Text>
                                </View>
                            )}
                            {geraetBoxCount > 0 && (
                                <View style={{ flex: 1, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#0284c7', borderRadius: 8, padding: 14, alignItems: 'center' }}>
                                    <Text style={{ fontSize: 12, color: '#0369a1', fontWeight: 'bold', textTransform: 'uppercase' }}>Sonstige Geräte</Text>
                                    <Text style={{ fontSize: 26, fontWeight: 'black', color: '#0284c7', marginTop: 3 }}>{geraetBoxCount} Stk.</Text>
                                </View>
                            )}
                            {totalReserveCount > 0 && (
                                <View style={{ flex: 1, backgroundColor: '#fffbeb', borderWidth: 1.5, borderColor: '#f59e0b', borderRadius: 8, padding: 14, alignItems: 'center' }}>
                                    <Text style={{ fontSize: 12, color: '#b45309', fontWeight: 'bold', textTransform: 'uppercase' }}>Reserve-Vorrat</Text>
                                    <Text style={{ fontSize: 26, fontWeight: 'black', color: '#d97706', marginTop: 3 }}>+{totalReserveCount} Stk.</Text>
                                </View>
                            )}
                            <View style={{ flex: 1, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#3b82f6', borderRadius: 8, padding: 14, alignItems: 'center' }}>
                                <Text style={{ fontSize: 12, color: '#1d4ed8', fontWeight: 'bold', textTransform: 'uppercase' }}>Stromkreise (Kreise)</Text>
                                <Text style={{ fontSize: 26, fontWeight: 'black', color: '#1e40af', marginTop: 3 }}>{kreisMap.size} Kreise</Text>
                            </View>
                        </View>

                        {/* Large, Beautiful Luminaire Specification Cards */}
                        <View style={{ flex: 1, backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#cbd5e1', borderRadius: 10, padding: 16 }}>
                            <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#1e293b', marginBottom: 14, textTransform: 'uppercase' }}>
                                Spezifikation der Leuchtentypen & Zuordnung der Nummern (Aufkleber):
                            </Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
                                {activeVariantGroups.map((grp) => {
                                    const iconBase64 = BMA_ICONS_BASE64[grp.iconKey] || BMA_ICONS_BASE64['notlicht_lampe'] || BMA_ICONS_BASE64['detector_blue'];

                                    return (
                                        <View
                                            key={grp.id}
                                            style={{
                                                width: '49%',
                                                backgroundColor: '#ffffff',
                                                borderWidth: 2,
                                                borderColor: grp.color,
                                                borderRadius: 10,
                                                padding: 12,
                                                flexDirection: 'row',
                                                gap: 14,
                                                alignItems: 'center',
                                            }}
                                        >
                                            {/* Photo / Icon */}
                                            <View
                                                style={{
                                                    width: 130,
                                                    height: 100,
                                                    backgroundColor: '#f8fafc',
                                                    borderRadius: 8,
                                                    borderWidth: 1.5,
                                                    borderColor: grp.color,
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    overflow: 'hidden',
                                                }}
                                            >
                                                {grp.photoBase64 && typeof grp.photoBase64 === 'string' && (grp.photoBase64.startsWith('data:image') || grp.photoBase64.startsWith('http') || grp.photoBase64.startsWith('/')) ? (
                                                    <Image src={grp.photoBase64} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                                ) : (
                                                    <Image src={iconBase64 || BMA_ICONS_BASE64['detector_blue']} style={{ width: 42, height: 42, objectFit: 'contain' }} />
                                                )}
                                            </View>

                                            {/* Details */}
                                            {grp.isHeating ? (
                                                <View style={{ flex: 1, gap: 3 }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                        <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: grp.color }} />
                                                        <Text style={{ fontSize: 13, fontWeight: 'black', color: grp.color, textTransform: 'uppercase' }}>
                                                            {grp.title} ({grp.count} Stück)
                                                        </Text>
                                                    </View>
                                                    <Text style={{ fontSize: 14, fontWeight: 'black', color: '#0f172a' }}>
                                                        {grp.model}
                                                    </Text>
                                                    {grp.powerKw && (
                                                        <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#0284c7' }}>
                                                            ⚡ Leistung: {grp.powerKw.includes('kW') ? grp.powerKw : grp.powerKw + ' kW'}
                                                        </Text>
                                                    )}
                                                    {grp.zuleitung && (
                                                        <Text style={{ fontSize: 10.5, fontWeight: 'bold', color: '#475569' }}>
                                                            🔌 Zuleitung: {grp.zuleitung}
                                                        </Text>
                                                    )}
                                                    {grp.notes && (
                                                        <Text style={{ fontSize: 10, color: '#64748b' }}>{grp.notes}</Text>
                                                    )}
                                                    {grp.stickerNumbers.length > 0 && (
                                                        <View style={{ marginTop: 4, backgroundColor: '#f0f9ff', borderWidth: 1, borderColor: '#bae6fd', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                                                            <Text style={{ fontSize: 10.5, color: '#0369a1', fontWeight: 'bold' }}>
                                                                Zugeordnete Geräte-Kennzeichnungen ({grp.stickerNumbers.length}):
                                                            </Text>
                                                            <Text style={{ fontSize: 9.5, color: '#0284c7', marginTop: 2, fontWeight: 'bold' }}>
                                                                {grp.stickerNumbers.join(', ')}
                                                            </Text>
                                                        </View>
                                                    )}
                                                </View>
                                            ) : (
                                                <View style={{ flex: 1, gap: 4 }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                        <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: grp.color }} />
                                                        <Text style={{ fontSize: 13, fontWeight: 'black', color: grp.color, textTransform: 'uppercase' }}>
                                                            {grp.title} ({grp.count} Stück)
                                                        </Text>
                                                    </View>
                                                    <Text style={{ fontSize: 15, fontWeight: 'black', color: '#0f172a' }}>
                                                        {grp.model}
                                                    </Text>
                                                    {grp.notes && (
                                                        <Text style={{ fontSize: 10.5, color: '#64748b' }}>{grp.notes}</Text>
                                                    )}
                                                    {grp.stickerNumbers.length > 0 && (
                                                        <View style={{ marginTop: 4, backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                                                            <Text style={{ fontSize: 10.5, color: '#166534', fontWeight: 'bold' }}>
                                                                Zugeordnete Leuchten-Nummern ({grp.stickerNumbers.length}):
                                                            </Text>
                                                            <Text style={{ fontSize: 9.5, color: '#15803d', marginTop: 2 }}>
                                                                {grp.stickerNumbers.join(', ')}
                                                            </Text>
                                                        </View>
                                                    )}
                                                </View>
                                            )}
                                        </View>
                                    );
                                })}
                            </View>
                        </View>
                    </Page>
                );
            })()}
        
            {/* ── KABELZÜGE & LEITUNGSLISTE (KABELVERBINDUNGEN) SEPARATE REPORT PAGE ── */}
            {(options.includeCables !== false && options.includeKabelzugliste !== false) && (() => {
                const allCables: Array<{
                    id: string;
                    planLabel: string;
                    name: string;
                    cable_number: string;
                    cable_type: string;
                    description: string;
                    sourceLabel: string;
                    targetLabel: string;
                    length_meters: number;
                    is_free_line: boolean;
                    color: string;
                }> = [];

                plansData.forEach((p, idx) => {
                    const pLabel = [p.buildingName, p.floorName, p.planName].filter(Boolean).join(' › ') || `Plan ${idx + 1}`;
                    (p.cableConnections || []).forEach((c: any) => {
                        // Skip legacy empty loop scans
                        if (c.name && (c.name.includes("Auto-generated") || c.name.startsWith("Loop "))) {
                          const m = c.metadata || {};
                          if (!m.waypoints?.length && !m.source_symbol_id && !m.cable_number) return;
                        }
                        const m = c.metadata || {};
                        const isFree = c.type === 'FREE_LINE' || m.is_free_line;
                        const s1 = p.bmaSymbols?.find((s: any) => s.id === m.source_symbol_id);
                        const s2 = p.bmaSymbols?.find((s: any) => s.id === m.target_symbol_id);

                        // Strict plan check: cable must belong to this plan
                        const belongsToPlan = !m.plan_id || m.plan_id === p.planId || m.source_plan_id === p.planId || m.target_plan_id === p.planId || !!(s1 || s2);
                        if (!belongsToPlan) return;

                        // Prevent duplicate addition of the same cable across multiple plan iterations
                        if (allCables.some((existing) => existing.id === c.id)) return;
                        
                        allCables.push({
                            id: c.id,
                            planLabel: pLabel,
                            name: c.name || m.cable_number || 'Kabel',
                            cable_number: m.cable_number || c.name || '—',
                            cable_type: m.cable_type || 'Standard',
                            description: m.description || c.description || '—',
                            sourceLabel: s1?.label || m.source_device_label || (isFree ? 'Freier Start' : 'Gerät A'),
                            targetLabel: s2?.label || m.target_device_label || (isFree ? 'Freies Ende' : 'Gerät B'),
                            length_meters: Number(m.length_meters) || 0,
                            is_free_line: isFree,
                            color: c.color || (isFree ? '#f59e0b' : '#0284c7'),
                        });
                    });
                });

                if (allCables.length === 0) return null;

                // Sort cables by Unit first (U1, U2, U3...), then by Target (Nach / Ziel), then by Cable Number!
                const getUnitNum = (targetLabel: string, sourceLabel: string): number => {
                    const combined = `${targetLabel || ''} ${sourceLabel || ''}`;
                    const match = combined.match(/\bU[_-]?(\d+)\b/i) || combined.match(/\bUnit[_-]?\s*(\d+)\b/i);
                    return match ? parseInt(match[1], 10) : 999999;
                };

                allCables.sort((a, b) => {
                    const unitA = getUnitNum(a.targetLabel, a.sourceLabel);
                    const unitB = getUnitNum(b.targetLabel, b.sourceLabel);

                    if (unitA !== unitB) {
                        return unitA - unitB;
                    }

                    const targetA = (a.targetLabel || '').toLowerCase();
                    const targetB = (b.targetLabel || '').toLowerCase();
                    const targetCompare = targetA.localeCompare(targetB, undefined, { numeric: true, sensitivity: 'base' });
                    if (targetCompare !== 0) return targetCompare;

                    const numA = (a.cable_number || '').toLowerCase();
                    const numB = (b.cable_number || '').toLowerCase();
                    return numA.localeCompare(numB, undefined, { numeric: true, sensitivity: 'base' });
                });

                const totalCableMeters = allCables.reduce((acc, c) => acc + c.length_meters, 0);
                const totalCablesCount = allCables.length;

                // Group lengths by cable type
                const typeSummary: Record<string, { count: number; meters: number }> = {};
                allCables.forEach(c => {
                    if (!typeSummary[c.cable_type]) typeSummary[c.cable_type] = { count: 0, meters: 0 };
                    typeSummary[c.cable_type].count += 1;
                    typeSummary[c.cable_type].meters += c.length_meters;
                });

                    // Chunk cables into clean pages so every Unit (U1, U2, U3...) starts on a NEW page!
                    const pageChunks: Array<{ pageIndex: number; isFirstPage: boolean; cables: typeof allCables }> = [];

                    // Group cables by Unit
                    const unitGroupsMap: Array<{ key: string; cables: typeof allCables }> = [];
                    allCables.forEach(c => {
                        const uNum = getUnitNum(c.targetLabel, c.sourceLabel);
                        const key = uNum === 999999 ? 'Z_OTHER' : `U${uNum}`;
                        let group = unitGroupsMap.find(g => g.key === key);
                        if (!group) {
                            group = { key, cables: [] };
                            unitGroupsMap.push(group);
                        }
                        group.cables.push(c);
                    });

                    let globalPageIndex = 0;

                    unitGroupsMap.forEach((group) => {
                        const uCables = group.cables;
                        if (uCables.length === 0) return;

                        const isVeryFirstPage = globalPageIndex === 0;
                        const firstCap = isVeryFirstPage ? 11 : 12;
                        const nextCap = 14;

                        if (uCables.length <= firstCap) {
                            pageChunks.push({
                                pageIndex: globalPageIndex,
                                isFirstPage: isVeryFirstPage,
                                cables: uCables,
                            });
                            globalPageIndex++;
                        } else {
                            pageChunks.push({
                                pageIndex: globalPageIndex,
                                isFirstPage: isVeryFirstPage,
                                cables: uCables.slice(0, firstCap),
                            });
                            globalPageIndex++;
                            let remaining = uCables.slice(firstCap);
                            while (remaining.length > 0) {
                                pageChunks.push({
                                    pageIndex: globalPageIndex,
                                    isFirstPage: false,
                                    cables: remaining.slice(0, nextCap),
                                });
                                remaining = remaining.slice(nextCap);
                                globalPageIndex++;
                            }
                        }
                    });

                    if (pageChunks.length === 0) {
                        pageChunks.push({
                            pageIndex: 0,
                            isFirstPage: true,
                            cables: [],
                        });
                    }

                    const totalCablePages = pageChunks.length;

                    return (
                        <>
                            {pageChunks.map((chunk) => (
                                <Page
                                    key={`kabelzugliste-page-${chunk.pageIndex}`}
                                    size="A4"
                                    orientation="landscape"
                                    style={[styles.page, { padding: 24, backgroundColor: '#ffffff' }]}
                                    wrap={false}
                                >
                                    {/* Header Bar */}
                                    <View style={[styles.header, { height: 44, backgroundColor: '#0284c7', paddingHorizontal: 16, marginBottom: 14, borderRadius: 6 }]}>
                                        <View style={styles.headerLeft}>
                                            <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#ffffff' }}>
                                                KABELZÜGLISTE & LEITUNGSVERZEICHNIS {totalCablePages > 1 ? `(${chunk.pageIndex + 1}/${totalCablePages})` : ''}
                                            </Text>
                                            <Text style={styles.headerDivider}>|</Text>
                                            <Text style={{ fontSize: 11, color: '#e0f2fe' }}>
                                                {translations.project || 'Projekt'}: <Text style={{ fontWeight: 'bold', color: '#ffffff' }}>{projectName}</Text>
                                            </Text>
                                        </View>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                            <Text style={{ fontSize: 10, color: '#e0f2fe' }}>
                                                {translations.generatedOn || 'Erstellt am'}: {new Date().toLocaleDateString()}
                                            </Text>
                                        </View>
                                    </View>

                                     {/* Custom Hinweis Banner (only on page 1) */}
                                     {chunk.isFirstPage && options.kabelhinweisText && options.kabelhinweisText.trim() ? (
                                         <View style={{
                                             marginBottom: 10,
                                             padding: 8,
                                             backgroundColor: '#fefce8',
                                             borderWidth: 1,
                                             borderColor: '#eab308',
                                             borderRadius: 6,
                                         }}>
                                             <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#854d0e', marginBottom: 2 }}>
                                                 HINWEIS:
                                             </Text>
                                             <Text style={{ fontSize: 8.5, color: '#713f12', lineHeight: 1.3 }}>
                                                 {options.kabelhinweisText.trim()}
                                             </Text>
                                         </View>
                                     ) : null}

                                    {/* Top Summary Banner (only on page 1) */}
                                    {chunk.isFirstPage && (
                                        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                                            <View style={{ flex: 1, backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#86efac', borderRadius: 6, padding: 8, alignItems: 'center' }}>
                                                <Text style={{ fontSize: 9, color: '#166534', fontWeight: 'bold', textTransform: 'uppercase' }}>Gesamte Kabellänge</Text>
                                                <Text style={{ fontSize: 18, fontWeight: 'black', color: '#15803d', marginTop: 2 }}>{Math.round(totalCableMeters * 10) / 10} m</Text>
                                            </View>
                                            <View style={{ flex: 1, backgroundColor: '#f0f9ff', borderWidth: 1, borderColor: '#bae6fd', borderRadius: 6, padding: 8, alignItems: 'center' }}>
                                                <Text style={{ fontSize: 9, color: '#0369a1', fontWeight: 'bold', textTransform: 'uppercase' }}>Anzahl Kabelzüge</Text>
                                                <Text style={{ fontSize: 18, fontWeight: 'black', color: '#0284c7', marginTop: 2 }}>{totalCablesCount} Stk.</Text>
                                            </View>
                                            <View style={{ flex: 2, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 6, padding: 6 }}>
                                                <Text style={{ fontSize: 8, color: '#475569', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 3 }}>Kabeltypen & Querschnitte:</Text>
                                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                                    {Object.entries(typeSummary).map(([tName, tData]) => (
                                                        <Text key={tName} style={{ fontSize: 8, color: '#0f172a', backgroundColor: '#e2e8f0', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 }}>
                                                            <Text style={{ fontWeight: 'bold' }}>{tName}</Text>: {Math.round(tData.meters * 10) / 10} m ({tData.count}x)
                                                        </Text>
                                                    ))}
                                                </View>
                                            </View>
                                        </View>
                                    )}

                                    {/* Cable Table */}
                                    <View style={{ borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 6, overflow: 'hidden' }}>
                                        {/* Table Header (REPEATED ON EVERY PAGE!) */}
                                        <View style={{ flexDirection: 'row', backgroundColor: '#0f172a', paddingVertical: 6, paddingHorizontal: 8 }}>
                                            <Text style={{ width: '10%', fontSize: 9, fontWeight: 'bold', color: '#f8fafc' }}>Kabel-Nr.</Text>
                                            <Text style={{ width: '19%', fontSize: 9, fontWeight: 'bold', color: '#f8fafc' }}>Kabeltyp / Querschnitt</Text>
                                            <Text style={{ width: '18%', fontSize: 9, fontWeight: 'bold', color: '#38bdf8' }}>Von (Quelle)</Text>
                                            <Text style={{ width: '18%', fontSize: 9, fontWeight: 'bold', color: '#4ade80' }}>Nach (Ziel)</Text>
                                            <Text style={{ width: '11%', fontSize: 9, fontWeight: 'bold', color: '#f8fafc', textAlign: 'right', paddingRight: 16 }}>Länge</Text>
                                            <Text style={{ width: '24%', fontSize: 9, fontWeight: 'bold', color: '#f8fafc', paddingLeft: 12 }}>Kabelbezeichnung / Funktion</Text>
                                        </View>

                                        {/* Table Rows for this page chunk */}
                                        {chunk.cables.length === 0 ? (
                                             <View style={{ padding: 16, alignItems: 'center', backgroundColor: '#ffffff', borderTopWidth: 1, borderTopColor: '#e2e8f0' }}>
                                                 <Text style={{ fontSize: 9, color: '#64748b' }}>
                                                     Keine Kabelverbindungen auf den ausgewählten Plänen vorhanden.
                                                 </Text>
                                             </View>
                                         ) : (
                                             chunk.cables.map((cable, idx) => {
                                                 const descText = (cable.description && cable.description !== '—') ? cable.description : cable.name;
                                                 return (
                                                     <View
                                                         key={cable.id || idx}
                                                         style={{
                                                             flexDirection: 'row',
                                                             paddingVertical: 6,
                                                             paddingHorizontal: 8,
                                                             backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                                                             borderTopWidth: 1,
                                                             borderTopColor: '#e2e8f0',
                                                             alignItems: 'center',
                                                         }}
                                                     >
                                                         <Text style={{ width: '10%', fontSize: 9, fontWeight: 'bold', color: cable.color }}>{cable.cable_number}</Text>
                                                         <Text style={{ width: '19%', fontSize: 8.5, color: '#1e293b' }}>{cable.cable_type}</Text>
                                                         <Text style={{ width: '18%', fontSize: 8.5, color: '#0369a1', fontWeight: 'bold' }}>{cable.sourceLabel}</Text>
                                                         <Text style={{ width: '18%', fontSize: 8.5, color: '#15803d', fontWeight: 'bold' }}>{cable.targetLabel}</Text>
                                                         <Text style={{ width: '11%', fontSize: 9, fontWeight: 'bold', color: '#0f172a', textAlign: 'right', paddingRight: 16 }}>
                                                             {cable.length_meters ? `${cable.length_meters} m` : '—'}
                                                         </Text>
                                                         <Text style={{ width: '24%', fontSize: 10, fontWeight: 'bold', color: '#0f172a', paddingLeft: 12 }}>
                                                             {descText}
                                                         </Text>
                                                     </View>
                                                 );
                                             })
                                         )}
                                    </View>
                                </Page>
                            ))}
                        </>
                    );
                })()}

            {/* ── DEDICATED FOTO-PINS / ZDJĘCIA REPORT SECTION ── */}
            {options.includePhotoPins !== false && (() => {
                const allGenericPhotos: Array<{
                    id: string;
                    pinIdx: number;
                    planName: string;
                    buildingName?: string;
                    floorName?: string;
                    description?: string | null;
                    photo_url?: string | null;
                    photoBase64?: string | null;
                    created_at?: string;
                    user_name?: string;
                }> = [];

                for (const plan of plansData) {
                    const fullPlanLabel = [plan.buildingName, plan.floorName, plan.planName].filter(Boolean).join(' - ') || plan.planName || 'Plan';
                    if (Array.isArray(plan.photoPins)) {
                        plan.photoPins.forEach((p, pIdx) => {
                            if (p.photoBase64 || p.photo_url || p.description) {
                                allGenericPhotos.push({
                                    id: p.id,
                                    pinIdx: pIdx + 1,
                                    planName: fullPlanLabel,
                                    buildingName: plan.buildingName,
                                    floorName: plan.floorName,
                                    description: p.description,
                                    photo_url: p.photo_url,
                                    photoBase64: p.photoBase64,
                                    created_at: p.created_at,
                                    user_name: p.user_name,
                                });
                            }
                        });
                    }
                }

                if (allGenericPhotos.length === 0) return null;

                const itemsPerPage = 4;
                const photoPages: typeof allGenericPhotos[] = [];
                for (let i = 0; i < allGenericPhotos.length; i += itemsPerPage) {
                    photoPages.push(allGenericPhotos.slice(i, i + itemsPerPage));
                }

                const totalPhotoPages = photoPages.length;

                return (
                    <>
                        {photoPages.map((pageItems, pageIdx) => (
                            <Page
                                key={`generic-photo-page-${pageIdx}`}
                                size="A0"
                                orientation="landscape"
                                style={[styles.page, { padding: 24, backgroundColor: '#ffffff' }]}
                                wrap={false}
                            >
                                {/* Header */}
                                <View style={[styles.header, { height: 56, backgroundColor: '#0284c7', paddingHorizontal: 20, marginBottom: 16, borderRadius: 8 }]}>
                                    <View style={styles.headerLeft}>
                                        <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#ffffff' }}>
                                            FOTO-PINS / FOTODOKUMENTATION (ZDJĘCIA) {totalPhotoPages > 1 ? `(${pageIdx + 1}/${totalPhotoPages})` : ''}
                                        </Text>
                                        <Text style={{ fontSize: 20, color: '#93c5fd' }}>|</Text>
                                        <Text style={{ fontSize: 16, color: '#e0f2fe' }}>
                                            {translations.project || 'Projekt'}: <Text style={{ fontWeight: 'bold', color: '#ffffff' }}>{projectName}</Text>
                                        </Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                        <Text style={{ fontSize: 14, color: '#e0f2fe' }}>
                                            {translations.generatedOn || 'Erstellt am'}: {new Date().toLocaleDateString()}
                                        </Text>
                                    </View>
                                </View>

                                {/* 2x2 Grid of Photos on A0 */}
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20, flex: 1, justifyContent: 'space-between' }}>
                                    {pageItems.map((item) => {
                                        const dateStr = item.created_at ? new Date(item.created_at).toLocaleString() : '';
                                        const imgSrc = item.photoBase64 || item.photo_url;
                                        const fullSizeUrl = item.photo_url;

                                        return (
                                            <View
                                                key={item.id}
                                                style={{
                                                    width: '49.4%',
                                                    height: '48.5%',
                                                    backgroundColor: '#f8fafc',
                                                    borderWidth: 2,
                                                    borderColor: '#cbd5e1',
                                                    borderRadius: 12,
                                                    padding: 16,
                                                    flexDirection: 'row',
                                                    gap: 20,
                                                }}
                                            >
                                                {/* Left: Image with click link */}
                                                <View style={{ width: '58%', height: '100%', backgroundColor: '#0f172a', borderRadius: 8, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' }}>
                                                    {imgSrc ? (
                                                        fullSizeUrl ? (
                                                            <Link src={fullSizeUrl} style={{ width: '100%', height: '100%' }}>
                                                                <Image
                                                                    src={imgSrc}
                                                                    style={{
                                                                        width: '100%',
                                                                        height: '100%',
                                                                        objectFit: 'contain',
                                                                    }}
                                                                />
                                                            </Link>
                                                        ) : (
                                                            <Image
                                                                src={imgSrc}
                                                                style={{
                                                                    width: '100%',
                                                                    height: '100%',
                                                                    objectFit: 'contain',
                                                                }}
                                                            />
                                                        )
                                                    ) : (
                                                        <Text style={{ fontSize: 18, color: '#94a3b8' }}>Kein Foto</Text>
                                                    )}
                                                </View>

                                                {/* Right: Info */}
                                                <View style={{ width: '39%', justifyContent: 'space-between', paddingVertical: 8 }}>
                                                    <View>
                                                        {/* Badge & Plan */}
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                                            <View style={{ backgroundColor: '#0284c7', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6 }}>
                                                                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#ffffff' }}>
                                                                    PIN #F{item.pinIdx}
                                                                </Text>
                                                            </View>
                                                            <Text style={{ fontSize: 16, color: '#475569', fontWeight: 'bold' }}>
                                                                {item.planName}
                                                            </Text>
                                                        </View>

                                                        {/* Description */}
                                                        {item.description ? (
                                                            <Text style={{ fontSize: 18, color: '#0f172a', fontWeight: 'bold', marginTop: 10, marginBottom: 8, lineHeight: 1.3 }}>
                                                                {item.description}
                                                            </Text>
                                                        ) : (
                                                            <Text style={{ fontSize: 16, color: '#64748b', marginTop: 10, marginBottom: 8 }}>
                                                                Foto-Dokumentation
                                                            </Text>
                                                        )}

                                                        {/* Author & Timestamp */}
                                                        {dateStr ? (
                                                            <Text style={{ fontSize: 14, color: '#64748b', marginBottom: 4 }}>
                                                                {dateStr}
                                                            </Text>
                                                        ) : null}
                                                        {item.user_name ? (
                                                            <Text style={{ fontSize: 14, color: '#64748b' }}>
                                                                {item.user_name}
                                                            </Text>
                                                        ) : null}
                                                    </View>

                                                    {/* Click to open full size */}
                                                    {fullSizeUrl && (
                                                        <Link
                                                            src={fullSizeUrl}
                                                            style={{
                                                                backgroundColor: '#e0f2fe',
                                                                borderWidth: 1.5,
                                                                borderColor: '#0284c7',
                                                                borderRadius: 8,
                                                                paddingVertical: 10,
                                                                paddingHorizontal: 16,
                                                                alignItems: 'center',
                                                                textDecoration: 'none',
                                                            }}
                                                        >
                                                            <Text style={{ fontSize: 14, color: '#0369a1', fontWeight: 'bold' }}>
                                                                In voller Größe öffnen (HD)
                                                            </Text>
                                                        </Link>
                                                    )}
                                                </View>
                                            </View>
                                        );
                                    })}
                                </View>
                            </Page>
                        ))}
                    </>
                );
            })()}

            {/* ── DEDICATED MONTAGEDOKUMENTATION (MONTAGE-DOKU) REPORT SECTION ── */}
            {options.includeMontageDoku !== false && (() => {
                const allMontagePhotos: Array<{
                    id: string;
                    pinIdx: number;
                    planName: string;
                    buildingName?: string;
                    floorName?: string;
                    description?: string | null;
                    photo_url?: string | null;
                    photoBase64?: string | null;
                    created_at?: string;
                    user_name?: string;
                }> = [];

                for (const plan of plansData) {
                    const fullPlanLabel = [plan.buildingName, plan.floorName, plan.planName].filter(Boolean).join(' - ') || plan.planName || 'Plan';
                    if (Array.isArray(plan.montagePins)) {
                        plan.montagePins.forEach((p, pIdx) => {
                            if (p.photoBase64 || p.photo_url || p.description) {
                                allMontagePhotos.push({
                                    id: p.id,
                                    pinIdx: pIdx + 1,
                                    planName: fullPlanLabel,
                                    buildingName: plan.buildingName,
                                    floorName: plan.floorName,
                                    description: p.description,
                                    photo_url: p.photo_url,
                                    photoBase64: p.photoBase64,
                                    created_at: p.created_at,
                                    user_name: p.user_name,
                                });
                            }
                        });
                    }
                }

                if (allMontagePhotos.length === 0) return null;

                const itemsPerPage = 4;
                const montagePages: typeof allMontagePhotos[] = [];
                for (let i = 0; i < allMontagePhotos.length; i += itemsPerPage) {
                    montagePages.push(allMontagePhotos.slice(i, i + itemsPerPage));
                }

                const totalMontagePages = montagePages.length;

                return (
                    <>
                        {montagePages.map((pageItems, pageIdx) => (
                            <Page
                                key={`montage-doku-page-${pageIdx}`}
                                size="A0"
                                orientation="landscape"
                                style={[styles.page, { padding: 24, backgroundColor: '#ffffff' }]}
                                wrap={false}
                            >
                                {/* Header */}
                                <View style={[styles.header, { height: 56, backgroundColor: '#6b21a8', paddingHorizontal: 20, marginBottom: 16, borderRadius: 8 }]}>
                                    <View style={styles.headerLeft}>
                                        <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#ffffff' }}>
                                            MONTAGEDOKUMENTATION / FOTO-DOKUMENTATION {totalMontagePages > 1 ? `(${pageIdx + 1}/${totalMontagePages})` : ''}
                                        </Text>
                                        <Text style={{ fontSize: 20, color: '#d8b4fe' }}>|</Text>
                                        <Text style={{ fontSize: 16, color: '#f3e8ff' }}>
                                            {translations.project || 'Projekt'}: <Text style={{ fontWeight: 'bold', color: '#ffffff' }}>{projectName}</Text>
                                        </Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                        <Text style={{ fontSize: 14, color: '#f3e8ff' }}>
                                            {translations.generatedOn || 'Erstellt am'}: {new Date().toLocaleDateString()}
                                        </Text>
                                    </View>
                                </View>

                                {/* 2x2 Grid of Montage Photos on A0 */}
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20, flex: 1, justifyContent: 'space-between' }}>
                                    {pageItems.map((item) => {
                                        const dateStr = item.created_at ? new Date(item.created_at).toLocaleString() : '';
                                        const imgSrc = item.photoBase64 || item.photo_url;
                                        const fullSizeUrl = item.photo_url;

                                        return (
                                            <View
                                                key={item.id}
                                                style={{
                                                    width: '49.4%',
                                                    height: '48.5%',
                                                    backgroundColor: '#f8fafc',
                                                    borderWidth: 2,
                                                    borderColor: '#cbd5e1',
                                                    borderRadius: 12,
                                                    padding: 16,
                                                    flexDirection: 'row',
                                                    gap: 20,
                                                }}
                                            >
                                                {/* Left: Image with click link */}
                                                <View style={{ width: '58%', height: '100%', backgroundColor: '#0f172a', borderRadius: 8, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' }}>
                                                    {imgSrc ? (
                                                        fullSizeUrl ? (
                                                            <Link src={fullSizeUrl} style={{ width: '100%', height: '100%' }}>
                                                                <Image
                                                                    src={imgSrc}
                                                                    style={{
                                                                        width: '100%',
                                                                        height: '100%',
                                                                        objectFit: 'contain',
                                                                    }}
                                                                />
                                                            </Link>
                                                        ) : (
                                                            <Image
                                                                src={imgSrc}
                                                                style={{
                                                                    width: '100%',
                                                                    height: '100%',
                                                                    objectFit: 'contain',
                                                                }}
                                                            />
                                                        )
                                                    ) : (
                                                        <Text style={{ fontSize: 18, color: '#94a3b8' }}>Kein Foto</Text>
                                                    )}
                                                </View>

                                                {/* Right: Info */}
                                                <View style={{ width: '39%', justifyContent: 'space-between', paddingVertical: 8 }}>
                                                    <View>
                                                        {/* Badge & Plan */}
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                                            <View style={{ backgroundColor: '#7c3aed', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6 }}>
                                                                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#ffffff' }}>
                                                                    PIN #MD{item.pinIdx}
                                                                </Text>
                                                            </View>
                                                            <Text style={{ fontSize: 16, color: '#475569', fontWeight: 'bold' }}>
                                                                {item.planName}
                                                            </Text>
                                                        </View>

                                                        {/* Description */}
                                                        {item.description ? (
                                                            <Text style={{ fontSize: 18, color: '#0f172a', fontWeight: 'bold', marginTop: 10, marginBottom: 8, lineHeight: 1.3 }}>
                                                                {item.description}
                                                            </Text>
                                                        ) : (
                                                            <Text style={{ fontSize: 16, color: '#64748b', marginTop: 10, marginBottom: 8 }}>
                                                                Montagedokumentation
                                                            </Text>
                                                        )}

                                                        {/* Author & Timestamp */}
                                                        {dateStr ? (
                                                            <Text style={{ fontSize: 14, color: '#64748b', marginBottom: 4 }}>
                                                                {dateStr}
                                                            </Text>
                                                        ) : null}
                                                        {item.user_name ? (
                                                            <Text style={{ fontSize: 14, color: '#64748b' }}>
                                                                {item.user_name}
                                                            </Text>
                                                        ) : null}
                                                    </View>

                                                    {/* Click to open full size */}
                                                    {fullSizeUrl && (
                                                        <Link
                                                            src={fullSizeUrl}
                                                            style={{
                                                                backgroundColor: '#ede9fe',
                                                                borderWidth: 1.5,
                                                                borderColor: '#8b5cf6',
                                                                borderRadius: 8,
                                                                paddingVertical: 10,
                                                                paddingHorizontal: 16,
                                                                alignItems: 'center',
                                                                textDecoration: 'none',
                                                            }}
                                                        >
                                                            <Text style={{ fontSize: 14, color: '#6d28d9', fontWeight: 'bold' }}>
                                                                In voller Größe öffnen (HD)
                                                            </Text>
                                                        </Link>
                                                    )}
                                                </View>
                                            </View>
                                        );
                                    })}
                                </View>
                            </Page>
                        ))}
                    </>
                );
            })()}

            {/* ── DEDICATED BESCHÄDIGUNG (SCHADENSDOKUMENTATION) REPORT SECTION ── */}
            {options.includeDamage !== false && (() => {
                const allDamagePhotos: Array<{
                    id: string;
                    pinIdx: number;
                    planName: string;
                    buildingName?: string;
                    floorName?: string;
                    description?: string | null;
                    photo_url?: string | null;
                    photoBase64?: string | null;
                    created_at?: string;
                    user_name?: string;
                }> = [];

                for (const plan of plansData) {
                    const fullPlanLabel = [plan.buildingName, plan.floorName, plan.planName].filter(Boolean).join(' - ') || plan.planName || 'Plan';
                    if (Array.isArray(plan.damagePins)) {
                        plan.damagePins.forEach((p, pIdx) => {
                            if (p.photoBase64 || p.photo_url || p.description) {
                                allDamagePhotos.push({
                                    id: p.id,
                                    pinIdx: pIdx + 1,
                                    planName: fullPlanLabel,
                                    buildingName: plan.buildingName,
                                    floorName: plan.floorName,
                                    description: p.description,
                                    photo_url: p.photo_url,
                                    photoBase64: p.photoBase64,
                                    created_at: p.created_at,
                                    user_name: p.user_name,
                                });
                            }
                        });
                    }
                }

                if (allDamagePhotos.length === 0) return null;

                const itemsPerPage = 4;
                const damagePages: typeof allDamagePhotos[] = [];
                for (let i = 0; i < allDamagePhotos.length; i += itemsPerPage) {
                    damagePages.push(allDamagePhotos.slice(i, i + itemsPerPage));
                }

                const totalDamagePages = damagePages.length;

                return (
                    <>
                        {damagePages.map((pageItems, pageIdx) => (
                            <Page
                                key={`damage-doku-page-${pageIdx}`}
                                size="A0"
                                orientation="landscape"
                                style={[styles.page, { padding: 24, backgroundColor: '#ffffff' }]}
                                wrap={false}
                            >
                                {/* Header */}
                                <View style={[styles.header, { height: 56, backgroundColor: '#b91c1c', paddingHorizontal: 20, marginBottom: 16, borderRadius: 8 }]}>
                                    <View style={styles.headerLeft}>
                                        <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#ffffff' }}>
                                            BESCHÄDIGUNGSDOKUMENTATION / SCHADEN-DOKUMENTATION {totalDamagePages > 1 ? `(${pageIdx + 1}/${totalDamagePages})` : ''}
                                        </Text>
                                        <Text style={{ fontSize: 20, color: '#fca5a5' }}>|</Text>
                                        <Text style={{ fontSize: 16, color: '#fee2e2' }}>
                                            {translations.project || 'Projekt'}: <Text style={{ fontWeight: 'bold', color: '#ffffff' }}>{projectName}</Text>
                                        </Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                        <Text style={{ fontSize: 14, color: '#fee2e2' }}>
                                            {translations.generatedOn || 'Erstellt am'}: {new Date().toLocaleDateString()}
                                        </Text>
                                    </View>
                                </View>

                                {/* 2x2 Grid of Damage Photos on A0 */}
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20, flex: 1, justifyContent: 'space-between' }}>
                                    {pageItems.map((item) => {
                                        const dateStr = item.created_at ? new Date(item.created_at).toLocaleString() : '';
                                        const imgSrc = item.photoBase64 || item.photo_url;
                                        const fullSizeUrl = item.photo_url;

                                        return (
                                            <View
                                                key={item.id}
                                                style={{
                                                    width: '49.4%',
                                                    height: '48.5%',
                                                    backgroundColor: '#fef2f2',
                                                    borderWidth: 2,
                                                    borderColor: '#fca5a5',
                                                    borderRadius: 12,
                                                    padding: 16,
                                                    flexDirection: 'row',
                                                    gap: 20,
                                                }}
                                            >
                                                {/* Left: Image with click link */}
                                                <View style={{ width: '58%', height: '100%', backgroundColor: '#0f172a', borderRadius: 8, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' }}>
                                                    {imgSrc ? (
                                                        fullSizeUrl ? (
                                                            <Link src={fullSizeUrl} style={{ width: '100%', height: '100%' }}>
                                                                <Image
                                                                    src={imgSrc}
                                                                    style={{
                                                                        width: '100%',
                                                                        height: '100%',
                                                                        objectFit: 'contain',
                                                                    }}
                                                                />
                                                            </Link>
                                                        ) : (
                                                            <Image
                                                                src={imgSrc}
                                                                style={{
                                                                    width: '100%',
                                                                    height: '100%',
                                                                    objectFit: 'contain',
                                                                }}
                                                            />
                                                        )
                                                    ) : (
                                                        <Text style={{ fontSize: 18, color: '#94a3b8' }}>Kein Foto</Text>
                                                    )}
                                                </View>

                                                {/* Right: Info */}
                                                <View style={{ width: '39%', justifyContent: 'space-between', paddingVertical: 8 }}>
                                                    <View>
                                                        {/* Badge & Plan */}
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                                            <View style={{ backgroundColor: '#dc2626', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6 }}>
                                                                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#ffffff' }}>
                                                                    PIN #B{item.pinIdx}
                                                                </Text>
                                                            </View>
                                                            <Text style={{ fontSize: 16, color: '#475569', fontWeight: 'bold' }}>
                                                                {item.planName}
                                                            </Text>
                                                        </View>

                                                        {/* Description */}
                                                        {item.description ? (
                                                            <Text style={{ fontSize: 18, color: '#991b1b', fontWeight: 'bold', marginTop: 10, marginBottom: 8, lineHeight: 1.3 }}>
                                                                {item.description}
                                                            </Text>
                                                        ) : (
                                                            <Text style={{ fontSize: 16, color: '#64748b', marginTop: 10, marginBottom: 8 }}>
                                                                Beschädigungsdokumentation
                                                            </Text>
                                                        )}

                                                        {/* Author & Timestamp */}
                                                        {dateStr ? (
                                                            <Text style={{ fontSize: 14, color: '#64748b', marginBottom: 4 }}>
                                                                {dateStr}
                                                            </Text>
                                                        ) : null}
                                                        {item.user_name ? (
                                                            <Text style={{ fontSize: 14, color: '#64748b' }}>
                                                                {item.user_name}
                                                            </Text>
                                                        ) : null}
                                                    </View>

                                                    {/* Click to open full size */}
                                                    {fullSizeUrl && (
                                                        <Link
                                                            src={fullSizeUrl}
                                                            style={{
                                                                backgroundColor: '#fee2e2',
                                                                borderWidth: 1.5,
                                                                borderColor: '#ef4444',
                                                                borderRadius: 8,
                                                                paddingVertical: 10,
                                                                paddingHorizontal: 16,
                                                                alignItems: 'center',
                                                                textDecoration: 'none',
                                                            }}
                                                        >
                                                            <Text style={{ fontSize: 14, color: '#b91c1c', fontWeight: 'bold' }}>
                                                                In voller Größe öffnen (HD)
                                                            </Text>
                                                        </Link>
                                                    )}
                                                </View>
                                            </View>
                                        );
                                    })}
                                </View>
                            </Page>
                        ))}
                    </>
                );
            })()}

        </Document>
    );
}

export type AufkleberItem = {
    zuleitung?: string;
    powerKw?: string;
    isHeating?: boolean;
    id: string;
    label: string;
    rawLoop: string;
    rawAddress: string;
    kreisNum: number;
    lampNum: number;
    symbol_type: string;
    direction?: string;
    typeName: string;
    planName: string;
    buildingName?: string;
    floorName?: string;
    isReserve?: boolean;
    variantId?: string | null;
    variantColor?: string | null;
    variantName?: string | null;
    variantModel?: string | null;
};

export function extractAndSortAufkleberItems(plansData: ExportPlanData[], reservePerKreis: number = 0, options?: PlanElementsPdfProps['options']): AufkleberItem[] {
    const items: AufkleberItem[] = [];
    const kreisMaxMap = new Map<string, { kreisNum: number; maxLamp: number; rawLoop: string }>();

    for (const plan of plansData) {
        for (const s of plan.bmaSymbols) {
            if (options && !isSymbolIncluded(s.symbol_type, options)) continue;
            const isEmergency = s.symbol_type === 'notlicht_lampe' || s.symbol_type === 'notlicht_pikto' || s.symbol_type === 'notlicht_pikto_gross' || s.symbol_type === 'warmepumpe_aussen' || s.symbol_type === 'warmepumpe_innen' || s.symbol_type === 'infrarotheizung' || s.symbol_type === 'geraet_box';
            if (!isEmergency) continue;

            let loop = (s.loop_number || '').trim();
            let address = (s.address || '').trim();
            let label = (s.label || '').trim();

            if (!loop && label.includes('/')) {
                const parts = label.replace(/^L\s*/, '').split('/');
                loop = parts[0]?.trim() || '';
                if (!address && parts[1]) address = parts[1]?.trim() || '';
            }

            let kreisNum = parseInt(loop.replace(/\D/g, ''), 10);
            if (isNaN(kreisNum)) kreisNum = 999999;

            let lampNum = parseInt(address.replace(/\D/g, ''), 10);
            if (isNaN(lampNum)) {
                const match = label.match(/\/(\d+)/) || label.match(/(\d+)/);
                lampNum = match ? parseInt(match[1], 10) : 999999;
            }

            const cleanLabel = label || `${loop ? loop + '/' : ''}${address || '1'}`;
            const direction = getPiktoDirection(s.description);
            let dirName = '';
            if (direction === 'left') dirName = 'Links ⬅';
            else if (direction === 'right') dirName = 'Rechts ➔';
            else if (direction === 'down') dirName = 'Unten ⬇';
            else if (direction === 'up') dirName = 'Oben ⬆';

            let typeName = 'Notbeleuchtung Lampe';
            if (s.symbol_type === 'notlicht_pikto') {
                typeName = `Rettungszeichen klein (RZ-K)${dirName ? ' - ' + dirName : ''}`;
            } else if (s.symbol_type === 'notlicht_pikto_gross') {
                typeName = `Rettungszeichen groß (RZ-G)${dirName ? ' - ' + dirName : ''}`;
            } else if (s.symbol_type === 'warmepumpe_aussen') {
                typeName = 'Wärmepumpe Außen';
            } else if (s.symbol_type === 'warmepumpe_innen') {
                typeName = 'Wärmepumpe Innen';
            } else if (s.symbol_type === 'infrarotheizung') {
                typeName = 'Infrarotheizung';
            } else if (s.symbol_type === 'geraet_box') {
                typeName = 'Gerät / Steuerung';
            }

            let variantId: string | null = null;
            let variantColor: string | null = null;
            let variantName: string | null = null;
            let variantModel: string | null = null;
            let powerKw: string | null = null;
            if (s.description) {
                try {
                    const parsed = JSON.parse(s.description);
                    if (parsed.variantId) variantId = parsed.variantId;
                    if (parsed.powerKw) powerKw = parsed.powerKw;
                    if (plan.lampTypes?.variants && plan.lampTypes.variants.length > 0) {
                        const isHeating = s.symbol_type === 'warmepumpe_aussen' || s.symbol_type === 'warmepumpe_innen' || s.symbol_type === 'infrarotheizung' || s.symbol_type === 'geraet_box';
                        const found = plan.lampTypes.variants.find((v: any) => {
                            const vIsHeating = v.category === 'warmepumpe_aussen' || v.category === 'warmepumpe_innen' || v.category === 'infrarotheizung' || v.category === 'geraet_box';
                            if (isHeating !== vIsHeating) return false;
                            if (v.category && v.category !== s.symbol_type && !(v.category === 'geraet_box' && s.symbol_type === 'geraet_box')) {
                                return false;
                            }
                            if (parsed.variantId && v.id === parsed.variantId) return true;
                            if (parsed.variantName && v.name === parsed.variantName) return true;
                            return false;
                        });
                        if (found) {
                            variantId = found.id;
                            if (found.color) variantColor = found.color;
                            if (found.name) variantName = found.name;
                            if (found.model) variantModel = found.model;
                        }
                    }
                    if (!variantColor && parsed.variantColor && variantId) variantColor = parsed.variantColor;
                    if (!variantName && parsed.variantName && variantId) variantName = parsed.variantName;
                    if (!variantModel && parsed.variantModel) variantModel = parsed.variantModel;
                } catch {}
            }

            if (powerKw) {
                const kwStr = powerKw.includes('kW') ? powerKw : `${powerKw} kW`;
                typeName += ` (${kwStr})`;
            }

            const kKey = loop || String(kreisNum);
            const validLamp = lampNum < 999999 ? lampNum : 1;
            if (kreisNum < 999999 && loop && loop !== '999999') {
                const currentRecord = kreisMaxMap.get(kKey);
                if (!currentRecord) {
                    kreisMaxMap.set(kKey, { kreisNum, maxLamp: validLamp, rawLoop: loop });
                } else {
                    if (validLamp > currentRecord.maxLamp) {
                        currentRecord.maxLamp = validLamp;
                    }
                }
            }

            items.push({
                id: s.id,
                label: cleanLabel,
                rawLoop: loop || (kreisNum < 999999 ? String(kreisNum) : '1'),
                rawAddress: address || (lampNum < 999999 ? String(lampNum) : '1'),
                kreisNum,
                lampNum,
                symbol_type: s.symbol_type,
                direction,
                typeName,
                planName: plan.planName,
                buildingName: plan.buildingName,
                floorName: plan.floorName,
                isReserve: false,
                variantId,
                variantColor,
                variantName,
                variantModel,
            });
        }
    }

    // Append reserve items per circuit if requested (excluding unassigned 999999)
    if (reservePerKreis > 0) {
        for (const [kKey, info] of kreisMaxMap.entries()) {
            if (info.kreisNum >= 999999 || info.rawLoop === '999999') continue;
            for (let r = 1; r <= reservePerKreis; r++) {
                const nextLamp = info.maxLamp + r;
                const label = `${info.rawLoop}/${nextLamp}`;
                items.push({
                    id: `reserve-${kKey}-${nextLamp}`,
                    label,
                    rawLoop: info.rawLoop,
                    rawAddress: String(nextLamp),
                    kreisNum: info.kreisNum,
                    lampNum: nextLamp,
                    symbol_type: 'reserve',
                    typeName: '★ RESERVE (Notlicht / Pikto)',
                    planName: '— Reserve / Vorrat —',
                    buildingName: '',
                    floorName: '',
                    isReserve: true,
                });
            }
        }
    }

    // Sort strictly by kreisNum ASC, then lampNum ASC, then label
    items.sort((a, b) => {
        if (a.kreisNum !== b.kreisNum) return a.kreisNum - b.kreisNum;
        if (a.lampNum !== b.lampNum) return a.lampNum - b.lampNum;
        return a.label.localeCompare(b.label, undefined, { numeric: true });
    });

    return items;
}
