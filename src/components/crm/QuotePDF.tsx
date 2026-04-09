import { Document, Page, Text, View, StyleSheet, Image, Font } from '@react-pdf/renderer';
import construprotectLogo from '@/assets/construprotect-logo.png';

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 9, color: '#1a1a2e' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  logo: { width: 80, height: 80 },
  companyInfo: { textAlign: 'right', fontSize: 8, color: '#666' },
  companyName: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#1a1a2e', marginBottom: 2 },
  title: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#2563eb', marginBottom: 16 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  metaBox: { width: '48%', padding: 10, backgroundColor: '#f8fafc', borderRadius: 4 },
  metaLabel: { fontSize: 7, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 },
  metaValue: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  table: { marginTop: 8 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#1e293b', paddingVertical: 6, paddingHorizontal: 8, borderRadius: 4 },
  tableHeaderText: { color: '#fff', fontSize: 8, fontFamily: 'Helvetica-Bold' },
  tableRow: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: '#e2e8f0' },
  col1: { width: '8%' },
  col2: { width: '34%' },
  col3: { width: '10%', textAlign: 'right' },
  col4: { width: '16%', textAlign: 'right' },
  col5: { width: '14%', textAlign: 'right' },
  col6: { width: '18%', textAlign: 'right' },
  totalsBox: { marginTop: 16, alignSelf: 'flex-end', width: '45%', padding: 12, backgroundColor: '#f8fafc', borderRadius: 4 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  totalLabel: { fontSize: 9, color: '#64748b' },
  totalValue: { fontSize: 9, fontFamily: 'Helvetica-Bold' },
  grandTotal: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#2563eb' },
  notes: { marginTop: 24, padding: 10, backgroundColor: '#fffbeb', borderRadius: 4, fontSize: 8, color: '#92400e' },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, textAlign: 'center', fontSize: 7, color: '#94a3b8' },
  statusBadge: { fontSize: 8, fontFamily: 'Helvetica-Bold', padding: '2 6', borderRadius: 3 },
  validUntil: { fontSize: 8, color: '#ef4444', marginTop: 4 },
});

export interface QuotePDFItem {
  qty: number;
  description: string;
  unit_price_usd: number;
  discount_pct: number;
  line_total_usd: number;
}

interface QuotePDFProps {
  quoteNumber: string;
  date: string;
  validUntil?: string;
  status: string;
  clientName: string;
  clientCompany?: string;
  clientRnc?: string;
  clientEmail?: string;
  clientPhone?: string;
  items: QuotePDFItem[];
  subtotalUsd: number;
  itbisUsd: number;
  totalUsd: number;
  totalDop: number;
  exchangeRate: number;
  notes?: string;
}

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function QuotePDFDocument(props: QuotePDFProps) {
  const { quoteNumber, date, validUntil, clientName, clientCompany, clientRnc, clientEmail, clientPhone, items, subtotalUsd, itbisUsd, totalUsd, totalDop, exchangeRate, notes } = props;

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Image src={construprotectLogo} style={styles.logo} />
            <View>
              <Text style={styles.companyName}>ConstruProtect SRL</Text>
              <Text style={{ fontSize: 7, color: '#64748b' }}>RNC: 130-45678-9</Text>
              <Text style={{ fontSize: 7, color: '#64748b' }}>Av. 27 de Febrero #234</Text>
              <Text style={{ fontSize: 7, color: '#64748b' }}>Santo Domingo, RD</Text>
            </View>
          </View>
          <View style={styles.companyInfo}>
            <Text style={{ fontSize: 7, color: '#64748b' }}>info@construprotect.com</Text>
            <Text style={{ fontSize: 7, color: '#64748b' }}>+1 (809) 555-0100</Text>
          </View>
        </View>

        <Text style={styles.title}>COTIZACIÓN {quoteNumber}</Text>

        {/* Meta */}
        <View style={styles.metaRow}>
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>Cliente</Text>
            <Text style={styles.metaValue}>{clientName}</Text>
            {clientCompany && <Text style={{ fontSize: 8, color: '#475569' }}>{clientCompany}</Text>}
            {clientRnc && <Text style={{ fontSize: 8, color: '#475569' }}>RNC: {clientRnc}</Text>}
            {clientEmail && <Text style={{ fontSize: 7, color: '#94a3b8', marginTop: 2 }}>{clientEmail}</Text>}
            {clientPhone && <Text style={{ fontSize: 7, color: '#94a3b8' }}>{clientPhone}</Text>}
          </View>
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>Fecha</Text>
            <Text style={styles.metaValue}>{date}</Text>
            {validUntil && (
              <>
                <Text style={{ ...styles.metaLabel, marginTop: 6 }}>Válida hasta</Text>
                <Text style={styles.validUntil}>{validUntil}</Text>
              </>
            )}
            <Text style={{ ...styles.metaLabel, marginTop: 6 }}>Tasa de cambio</Text>
            <Text style={{ fontSize: 8 }}>1 USD = RD${fmt(exchangeRate)}</Text>
          </View>
        </View>

        {/* Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, styles.col1]}>#</Text>
            <Text style={[styles.tableHeaderText, styles.col2]}>Descripción</Text>
            <Text style={[styles.tableHeaderText, styles.col3]}>Cant.</Text>
            <Text style={[styles.tableHeaderText, styles.col4]}>P. Unit.</Text>
            <Text style={[styles.tableHeaderText, styles.col5]}>Desc.</Text>
            <Text style={[styles.tableHeaderText, styles.col6]}>Total</Text>
          </View>
          {items.map((item, i) => (
            <View key={i} style={[styles.tableRow, i % 2 === 0 ? {} : { backgroundColor: '#f8fafc' }]}>
              <Text style={styles.col1}>{i + 1}</Text>
              <Text style={styles.col2}>{item.description}</Text>
              <Text style={styles.col3}>{item.qty}</Text>
              <Text style={styles.col4}>${fmt(item.unit_price_usd)}</Text>
              <Text style={styles.col5}>{item.discount_pct > 0 ? `${item.discount_pct}%` : '-'}</Text>
              <Text style={[styles.col6, { fontFamily: 'Helvetica-Bold' }]}>${fmt(item.line_total_usd)}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totalsBox}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal USD</Text>
            <Text style={styles.totalValue}>${fmt(subtotalUsd)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>ITBIS (18%)</Text>
            <Text style={styles.totalValue}>${fmt(itbisUsd)}</Text>
          </View>
          <View style={[styles.totalRow, { borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 6, marginTop: 4 }]}>
            <Text style={styles.grandTotal}>Total USD</Text>
            <Text style={styles.grandTotal}>${fmt(totalUsd)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { fontSize: 10 }]}>Total RD$</Text>
            <Text style={[styles.totalValue, { fontSize: 10 }]}>RD${fmt(totalDop)}</Text>
          </View>
        </View>

        {notes && (
          <View style={styles.notes}>
            <Text style={{ fontFamily: 'Helvetica-Bold', marginBottom: 2 }}>Notas:</Text>
            <Text>{notes}</Text>
          </View>
        )}

        <Text style={styles.footer}>
          ConstruProtect SRL · Av. 27 de Febrero #234, Santo Domingo · RNC: 130-45678-9 · info@construprotect.com
        </Text>
      </Page>
    </Document>
  );
}
