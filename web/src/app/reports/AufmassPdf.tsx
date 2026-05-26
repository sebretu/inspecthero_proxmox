import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image, Font } from '@react-pdf/renderer';

// Register fonts if needed, using standard fonts for now
Font.register({
  family: 'Inter',
  src: 'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfMZhrib2Bg-4.ttf'
});

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: '#2563eb',
    paddingBottom: 20,
    marginBottom: 20
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0f172a'
  },
  subtitle: {
    fontSize: 10,
    color: '#64748b',
    textTransform: 'uppercase',
    marginTop: 4
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0f172a',
    backgroundColor: '#f1f5f9',
    padding: 8,
    marginTop: 20,
    marginBottom: 10,
    borderRadius: 4
  },
  annotatedImage: {
    width: '100%',
    maxHeight: 400,
    objectFit: 'contain',
    border: '1pt solid #e2e8f0',
    borderRadius: 8,
    marginBottom: 20
  },
  table: {
    width: 'auto',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRightWidth: 0,
    borderBottomWidth: 0
  },
  tableRow: {
    margin: 'auto',
    flexDirection: 'row'
  },
  tableColHeader: {
    width: '25%',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderLeftWidth: 0,
    borderTopWidth: 0,
    backgroundColor: '#f8fafc',
    padding: 5
  },
  tableCol: {
    width: '25%',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderLeftWidth: 0,
    borderTopWidth: 0,
    padding: 5
  },
  tableCellHeader: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#334155'
  },
  tableCell: {
    fontSize: 10,
    color: '#475569'
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 10
  },
  footerText: {
    fontSize: 8,
    color: '#94a3b8'
  },
  signatureBox: {
    marginTop: 50,
    flexDirection: 'row',
    justifyContent: 'space-around'
  },
  signatureLine: {
    width: 200,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    alignItems: 'center',
    paddingBottom: 5
  }
});

interface AnnotatedPhoto {
  id: string;
  url: string;
  caption: string;
  index: number;
  annotatedBase64: string;
}

interface AufmassPdfProps {
  session: any;
  materials: any[];
  labor: any[];
  annotatedPhotos: AnnotatedPhoto[];
  planImageBase64?: string | null;
  planWidth?: number;
  planHeight?: number;
  projectName: string;
  translations?: Record<string, string>;
  markers?: any[];
}

export const AufmassPdf = ({ session, materials, labor, annotatedPhotos, planImageBase64, planWidth = 1000, planHeight = 700, projectName, translations, markers = [] }: AufmassPdfProps) => {
  // A4 Portrait: 595 x 842 points
  const pageWidth = 595;
  const pageHeight = 842;
  const padding = 30 * 2; 
  const containerWidth = pageWidth - padding;
  
  const imgRatio = planWidth / planHeight;
  const finalW = containerWidth;
  const finalH = Math.min(400, containerWidth / imgRatio); 
  const scaledW = finalH * imgRatio;
  const finalOffsetX = (containerWidth - scaledW) / 2;
  const finalOffsetY = 0;

  // Filter out Allgemein (photo_id === null) from overall summary lists
  const validMaterials = materials.filter(m => m.photo_id !== null && m.photo_id !== undefined);
  const validLabor = labor.filter(l => l.photo_id !== null && l.photo_id !== undefined);

  // Grand totals computed over valid items (photo_id !== null)
  const totalMaterialPrice = validMaterials.reduce((acc, m) => acc + ((Number(m.price) || 0) * (Number(m.quantity) || 0)), 0);
  const totalLaborHours = validLabor.reduce((acc, l) => acc + (Number(l.total_calculated_hours) || (Number(l.worker_count) * Number(l.estimated_hours)) || 0), 0);

  // Group materials by normalized name and unit
  const groupedMaterialsMap: { [key: string]: { item_name: string; quantity: number; unit: string; price: number | null } } = {};
  validMaterials.forEach(m => {
    const normName = (m.item_name || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/\s*\+\s*/g, '+')
      .replace(/\s*-\s*/g, '-');
    const normUnit = (m.unit || '').trim().toLowerCase();
    const key = `${normName}|||${normUnit}`;
    const qty = Number(m.quantity) || 0;
    const price = m.price !== null && m.price !== undefined ? Number(m.price) : null;
    
    if (groupedMaterialsMap[key]) {
      groupedMaterialsMap[key].quantity += qty;
      if (groupedMaterialsMap[key].price === null && price !== null) {
        groupedMaterialsMap[key].price = price;
      }
    } else {
      groupedMaterialsMap[key] = {
        item_name: m.item_name,
        quantity: qty,
        unit: m.unit,
        price: price
      };
    }
  });
  const groupedMaterialsList = Object.values(groupedMaterialsMap);

  return (
  <Document>
    {/* Page 1: Overview */}
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{session.session_type === 'zusatz' ? 'Zusatzplanung' : 'Aufmaß'}</Text>
          <Text style={styles.subtitle}>{projectName} • {session.name}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 10, color: '#64748b' }}>Datum: {new Date(session.created_at).toLocaleDateString()}</Text>
        </View>
      </View>

      {planImageBase64 && (
        <View wrap={false} style={{ marginBottom: 20 }}>
          <Text style={styles.sectionTitle}>{translations?.planLocation || 'Lokalizacja na planie'}</Text>
          <View style={{ position: 'relative', width: containerWidth, height: finalH, border: '1pt solid #e2e8f0', borderRadius: 8, overflow: 'hidden', backgroundColor: '#fdfdfd' }}>
            <Image src={planImageBase64} style={{ position: 'absolute', top: finalOffsetY, left: finalOffsetX, width: scaledW, height: finalH }} />
            {markers.map((m, idx) => (
              <View key={m.id || idx} style={{
                position: 'absolute',
                top: finalOffsetY + (m.y * finalH),
                left: finalOffsetX + (m.x * scaledW),
                width: 16,
                height: 16,
                marginLeft: -8,
                marginTop: -16,
                backgroundColor: session.session_type === 'zusatz' ? '#f59e0b' : '#3b82f6',
                borderRadius: 8,
                border: '1.5pt solid white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Text style={{ color: 'white', fontSize: 8, fontWeight: 'bold' }}>
                  {`${session.session_type === 'zusatz' ? 'Z' : 'A'}${idx + 1}`}
                </Text>
              </View>
            ))}
            {markers.length === 0 && session.x_norm !== null && session.y_norm !== null && (
              <View style={{
                position: 'absolute',
                top: finalOffsetY + (session.y_norm * finalH),
                left: finalOffsetX + (session.x_norm * scaledW),
                width: 16,
                height: 16,
                marginLeft: -8,
                marginTop: -16,
                backgroundColor: session.session_type === 'zusatz' ? '#f59e0b' : '#3b82f6',
                borderRadius: 8,
                border: '1.5pt solid white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Text style={{ color: 'white', fontSize: 8, fontWeight: 'bold' }}>
                  {session.session_type === 'zusatz' ? 'Z' : 'A'}
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      <Text style={styles.sectionTitle}>Arbeitsbeschreibung</Text>
      <Text style={{ fontSize: 10, color: '#334155', lineHeight: 1.5, marginBottom: 15 }}>
        {session.description || 'Keine Beschreibung angegeben.'}
      </Text>

      {session.session_type === 'aufmass' && (session.client_name || session.client_phone || session.client_email) && (
        <View wrap={false} style={{ marginBottom: 15 }}>
          <Text style={styles.sectionTitle}>Kundenkontakt</Text>
          <View style={{ backgroundColor: '#f8fafc', padding: 10, borderRadius: 6, border: '1pt solid #e2e8f0' }}>
            {session.client_name && <Text style={{ fontSize: 10, color: '#334155', marginBottom: 2 }}>Name/Firma: <Text style={{ fontWeight: 'bold' }}>{session.client_name}</Text></Text>}
            {session.client_phone && <Text style={{ fontSize: 10, color: '#334155', marginBottom: 2 }}>Telefon: <Text style={{ fontWeight: 'bold' }}>{session.client_phone}</Text></Text>}
            {session.client_email && <Text style={{ fontSize: 10, color: '#334155' }}>E-Mail: <Text style={{ fontWeight: 'bold' }}>{session.client_email}</Text></Text>}
          </View>
        </View>
      )}

      <View style={styles.footer} fixed>
        <Text style={styles.footerText}>Generiert durch InspectHero</Text>
        <Text style={styles.footerText} render={({ pageNumber, totalPages }) => (`Seite ${pageNumber} von ${totalPages}`)} />
      </View>
    </Page>

    {/* Photo specific pages */}
    {annotatedPhotos.map((photo) => {
      const photoMaterials = materials.filter(m => m.photo_id === photo.id);
      const photoLabor = labor.filter(l => l.photo_id === photo.id);

      return (
        <Page size="A4" style={styles.page} key={photo.id}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Dokumentation: Foto #{photo.index}</Text>
              <Text style={styles.subtitle}>{projectName} • {session.name}</Text>
            </View>
          </View>

          {photo.caption ? (
            <View style={{ marginBottom: 10 }}>
              <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#0f172a' }}>Beschreibung:</Text>
              <Text style={{ fontSize: 10, color: '#475569', marginTop: 2, lineHeight: 1.4 }}>{photo.caption}</Text>
            </View>
          ) : null}

          {photo.annotatedBase64 && (
            <Image src={photo.annotatedBase64} style={styles.annotatedImage} />
          )}

          {photoMaterials.length > 0 && (
            <View wrap={false} style={{ marginBottom: 15 }}>
              <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#0f172a', marginBottom: 5 }}>Foto-Spezifische Materialien</Text>
              <View style={styles.table}>
                <View style={styles.tableRow}>
                  <View style={{ ...styles.tableColHeader, width: '50%' }}><Text style={styles.tableCellHeader}>Artikel</Text></View>
                  <View style={{ ...styles.tableColHeader, width: '15%' }}><Text style={styles.tableCellHeader}>Menge</Text></View>
                  <View style={{ ...styles.tableColHeader, width: '15%' }}><Text style={styles.tableCellHeader}>Einheit</Text></View>
                  <View style={{ ...styles.tableColHeader, width: '20%' }}><Text style={styles.tableCellHeader}>Preis</Text></View>
                </View>
                {photoMaterials.map((m, i) => (
                  <View style={styles.tableRow} key={i}>
                    <View style={{ ...styles.tableCol, width: '50%' }}><Text style={styles.tableCell}>{m.item_name}</Text></View>
                    <View style={{ ...styles.tableCol, width: '15%' }}><Text style={styles.tableCell}>{m.quantity}</Text></View>
                    <View style={{ ...styles.tableCol, width: '15%' }}><Text style={styles.tableCell}>{m.unit}</Text></View>
                    <View style={{ ...styles.tableCol, width: '20%' }}><Text style={styles.tableCell}>{m.price ? `${m.price} €` : '-'}</Text></View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {photoLabor.length > 0 && (
            <View wrap={false}>
              <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#0f172a', marginBottom: 5 }}>Foto-Spezifische Arbeitszeit</Text>
              <View style={styles.table}>
                <View style={styles.tableRow}>
                  <View style={{ ...styles.tableColHeader, width: '50%' }}><Text style={styles.tableCellHeader}>Beschreibung</Text></View>
                  <View style={{ ...styles.tableColHeader, width: '20%' }}><Text style={styles.tableCellHeader}>Mitarbeiter</Text></View>
                  <View style={{ ...styles.tableColHeader, width: '30%' }}><Text style={styles.tableCellHeader}>Std. pro MA</Text></View>
                </View>
                {photoLabor.map((l, i) => (
                  <View style={styles.tableRow} key={i}>
                    <View style={{ ...styles.tableCol, width: '50%' }}><Text style={styles.tableCell}>{l.description || 'Allgemeine Arbeiten'}</Text></View>
                    <View style={{ ...styles.tableCol, width: '20%' }}><Text style={styles.tableCell}>{l.worker_count}</Text></View>
                    <View style={{ ...styles.tableCol, width: '30%' }}><Text style={styles.tableCell}>{l.estimated_hours}h</Text></View>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={styles.footer} fixed>
            <Text style={styles.footerText}>Generiert durch InspectHero</Text>
            <Text style={styles.footerText} render={({ pageNumber, totalPages }) => (`Seite ${pageNumber} von ${totalPages}`)} />
          </View>
        </Page>
      );
    })}

    {/* Summary Page: Overall Materials and Labor */}
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Aufmaß Details (Zusammenfassung)</Text>
          <Text style={styles.subtitle}>{projectName} • {session.name}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Materialien (Gesamtübersicht)</Text>
      {groupedMaterialsList.length > 0 ? (
        <View style={{ marginBottom: 20 }}>
          <View style={styles.table}>
            <View style={styles.tableRow}>
              <View style={{ ...styles.tableColHeader, width: '50%' }}><Text style={styles.tableCellHeader}>Artikel</Text></View>
              <View style={{ ...styles.tableColHeader, width: '15%' }}><Text style={styles.tableCellHeader}>Menge</Text></View>
              <View style={{ ...styles.tableColHeader, width: '15%' }}><Text style={styles.tableCellHeader}>Einheit</Text></View>
              <View style={{ ...styles.tableColHeader, width: '20%' }}><Text style={styles.tableCellHeader}>Preis</Text></View>
            </View>
            {groupedMaterialsList.map((m, i) => (
              <View style={styles.tableRow} key={i}>
                <View style={{ ...styles.tableCol, width: '50%' }}><Text style={styles.tableCell}>{m.item_name}</Text></View>
                <View style={{ ...styles.tableCol, width: '15%' }}><Text style={styles.tableCell}>{m.quantity}</Text></View>
                <View style={{ ...styles.tableCol, width: '15%' }}><Text style={styles.tableCell}>{m.unit}</Text></View>
                <View style={{ ...styles.tableCol, width: '20%' }}><Text style={styles.tableCell}>{m.price ? `${m.price} €` : '-'}</Text></View>
              </View>
            ))}
          </View>

          {/* Grand totals for materials */}
          <View style={{ marginTop: 10, padding: 8, backgroundColor: '#f8fafc', borderRadius: 4, border: '1pt solid #e2e8f0', flexDirection: 'row', justifyContent: 'flex-end', gap: 20 }}>
            {totalMaterialPrice > 0 ? (
              <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#334155' }}>Gesamtpreis: {totalMaterialPrice.toFixed(2)} €</Text>
            ) : null}
          </View>
        </View>
      ) : (
        <Text style={{ fontSize: 10, color: '#64748b', marginBottom: 20 }}>Keine Materialien erfasst.</Text>
      )}

      <Text style={styles.sectionTitle}>Monterstunden (Gesamtübersicht)</Text>
      {validLabor.length > 0 ? (
        <View>
          <View style={styles.table}>
            <View style={styles.tableRow}>
              <View style={{ ...styles.tableColHeader, width: '20%' }}><Text style={styles.tableCellHeader}>Zuordnung</Text></View>
              <View style={{ ...styles.tableColHeader, width: '40%' }}><Text style={styles.tableCellHeader}>Beschreibung</Text></View>
              <View style={{ ...styles.tableColHeader, width: '20%' }}><Text style={styles.tableCellHeader}>Mitarbeiter</Text></View>
              <View style={{ ...styles.tableColHeader, width: '20%' }}><Text style={styles.tableCellHeader}>Std. pro MA</Text></View>
            </View>
            {validLabor.map((l, i) => {
              const photoRef = l.photo_id ? annotatedPhotos.find(p => p.id === l.photo_id) : null;
              const assignmentText = photoRef ? `Foto #${photoRef.index}` : 'Allgemein';

              return (
                <View style={styles.tableRow} key={i}>
                  <View style={{ ...styles.tableCol, width: '20%' }}><Text style={styles.tableCell}>{assignmentText}</Text></View>
                  <View style={{ ...styles.tableCol, width: '40%' }}><Text style={styles.tableCell}>{l.description || 'Allgemeine Arbeiten'}</Text></View>
                  <View style={{ ...styles.tableCol, width: '20%' }}><Text style={styles.tableCell}>{l.worker_count}</Text></View>
                  <View style={{ ...styles.tableCol, width: '20%' }}><Text style={styles.tableCell}>{l.estimated_hours}h</Text></View>
                </View>
              );
            })}
          </View>

          {/* Grand totals for labor */}
          <View style={{ marginTop: 10, padding: 8, backgroundColor: '#f8fafc', borderRadius: 4, border: '1pt solid #e2e8f0', flexDirection: 'row', justifyContent: 'flex-end' }}>
            <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#334155' }}>Gesamtarbeitszeit: {totalLaborHours.toFixed(2)}h</Text>
          </View>
        </View>
      ) : (
        <Text style={{ fontSize: 10, color: '#64748b' }}>Keine Arbeitszeiten erfasst.</Text>
      )}

      <View style={styles.footer} fixed>
        <Text style={styles.footerText}>Generiert durch InspectHero</Text>
        <Text style={styles.footerText} render={({ pageNumber, totalPages }) => (`Seite ${pageNumber} von ${totalPages}`)} />
      </View>
    </Page>
  </Document>
  );
};
