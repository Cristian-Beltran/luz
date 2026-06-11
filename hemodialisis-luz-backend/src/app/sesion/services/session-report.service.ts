import { Injectable, NotFoundException } from '@nestjs/common';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import { Session } from '../entities/session.entity';
import { PdfService } from 'src/context/pdf/pdf.service';
import { SessionService } from './session.service';

type MetricStats = {
  min: number | null;
  max: number | null;
  avg: number | null;
  last: number | null;
};

@Injectable()
export class SessionReportService {
  constructor(
    private readonly sessionService: SessionService,
    private readonly pdfService: PdfService,
  ) {}

  async generateSessionReport(sessionId: string): Promise<{
    buffer: Buffer;
    fileName: string;
    session: Session;
  }> {
    const session = await this.sessionService.findOneDetailed(sessionId);
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const buffer = await this.pdfService.generatePdf(
      () => this.buildDocumentDefinition(session),
      {
        title: `Reporte clinico ${session.id}`,
        subject: 'Sesion de hemodialisis',
        author: 'Luz',
        creationDate: new Date(),
      },
    );

    return {
      buffer,
      fileName: this.buildFileName(session),
      session,
    };
  }

  private buildDocumentDefinition(session: Session): TDocumentDefinitions {
    const patient = session.patient;
    const records = session.records ?? [];
    const latest = records.at(-1) ?? null;
    const antecedentes = [
      patient.hasDiabetes ? 'Diabetes' : null,
      patient.hasHypertension ? 'Hipertension' : null,
      patient.hasHeartDisease ? 'Enfermedad cardiaca' : null,
      patient.hasAnemia ? 'Anemia' : null,
      patient.hasPreviousInfections ? 'Infecciones previas' : null,
    ].filter(Boolean);
    const sintomas = [
      session.dizziness ? 'Mareos' : null,
      session.nausea ? 'Nausea' : null,
      session.cramps ? 'Calambres' : null,
      session.pain ? 'Dolor' : null,
      session.shortnessOfBreath ? 'Falta de aire' : null,
      session.weakness ? 'Debilidad' : null,
      session.chills ? 'Escalofrios' : null,
    ].filter(Boolean);

    const pulse = this.metricStats(records.map((record) => record.pulse));
    const spo2 = this.metricStats(records.map((record) => record.oxygenSaturation));
    const temp = this.metricStats(records.map((record) => record.temperatureC));
    const systolic = this.metricStats(records.map((record) => record.systolic));
    const diastolic = this.metricStats(records.map((record) => record.diastolic));

    const aiMessages = (session.aiMessages ?? []).slice(0, 5);

    const content: any[] = [
      {
        columns: [
          [
            { text: 'Reporte Clinico de Sesion', style: 'title' },
            {
              text: `Sesion ${session.id.slice(0, 8)}  |  ${this.formatDateTime(session.startedAt)}`,
              style: 'muted',
            },
          ],
          {
            width: 170,
            table: {
              body: [
                ['Estado', session.endedAt ? 'Cerrada' : 'Activa'],
                ['Lecturas', String(records.length)],
                [
                  'Duracion',
                  `${session.sessionDurationMinutes ?? this.computeDurationMinutes(session)} min`,
                ],
              ],
            },
            layout: 'lightHorizontalLines',
          },
        ],
      },
      { text: 'Paciente', style: 'section' },
      {
        columns: [
          this.infoCard('Nombre', patient.user.fullname),
          this.infoCard('Edad / Sexo', `${patient.age} / ${patient.sex}`),
          this.infoCard('Tipo', patient.patientType.replace('_', ' ')),
        ],
      },
      {
        columns: [
          this.infoCard('Referencia', patient.referenceName),
          this.infoCard('Telefono', patient.referencePhone),
          this.infoCard('Enfermedad base', patient.baseDisease ?? 'Sin dato'),
        ],
        columnGap: 10,
        margin: [0, 8, 0, 0],
      },
      {
        columns: [
          this.infoCard('Alergias', patient.knownAllergies ?? 'Sin dato'),
          this.infoCard('Antecedentes', antecedentes.join(', ') || 'Ninguno'),
        ],
        columnGap: 10,
        margin: [0, 8, 0, 0],
      },
      { text: 'Terapia', style: 'section' },
      {
        columns: [
          this.infoCard('Inicio', this.formatDateTime(session.startedAt)),
          this.infoCard(
            'Fin',
            session.endedAt ? this.formatDateTime(session.endedAt) : 'Sesion activa',
          ),
          this.infoCard(
            'Pesos',
            `${session.weightBefore ?? '-'} / ${session.weightAfter ?? '-'} / ${session.dryWeight ?? '-'}`,
          ),
        ],
      },
      {
        columns: [
          this.infoCard('Sintomas reportados', session.reportedSymptoms ?? 'Sin dato'),
          this.infoCard('Sintomas marcados', sintomas.join(', ') || 'Ninguno'),
          this.infoCard(
            'Observaciones',
            session.staffObservations ?? 'Sin observaciones',
          ),
        ],
        columnGap: 10,
        margin: [0, 8, 0, 0],
      },
      { text: 'Resumen de metricas', style: 'section' },
      {
        columns: [
          this.metricCard('Pulso', 'bpm', pulse),
          this.metricCard('SpO2', '%', spo2),
          this.metricCard('Temp', 'C', temp),
          this.metricCard(
            'PA',
            'mmHg',
            {
              min: systolic.min,
              max: systolic.max,
              avg:
                systolic.avg != null && diastolic.avg != null
                  ? Number(`${this.formatNumber(systolic.avg, 0)}.${this.formatNumber(diastolic.avg, 0)}`)
                  : null,
              last:
                systolic.last != null && diastolic.last != null
                  ? Number(`${this.formatNumber(systolic.last, 0)}.${this.formatNumber(diastolic.last, 0)}`)
                  : null,
            },
            {
              avgLabel: `${this.formatStat(systolic.avg, 0)}/${this.formatStat(diastolic.avg, 0)}`,
              lastLabel: `${this.formatStat(systolic.last, 0)}/${this.formatStat(diastolic.last, 0)}`,
              rangeLabel: `${this.formatStat(systolic.min, 0)}-${this.formatStat(systolic.max, 0)} / ${this.formatStat(diastolic.min, 0)}-${this.formatStat(diastolic.max, 0)}`,
            },
          ),
        ],
        columnGap: 8,
      },
      { text: 'Graficas de la sesion', style: 'section', pageBreak: 'before' },
      {
        columns: [
          this.chartBlock('Pulso (bpm)', this.buildLineChartSvg(records, {
            color: '#2563eb',
            values: records.map((record) => record.pulse),
            labels: records.map((record) => record.recordedAt),
            unit: 'bpm',
          })),
          this.chartBlock('SpO2 (%)', this.buildLineChartSvg(records, {
            color: '#059669',
            values: records.map((record) => record.oxygenSaturation),
            labels: records.map((record) => record.recordedAt),
            unit: '%',
          })),
        ],
        columnGap: 10,
      },
      {
        columns: [
          this.chartBlock('Temperatura (C)', this.buildLineChartSvg(records, {
            color: '#dc2626',
            values: records.map((record) => record.temperatureC),
            labels: records.map((record) => record.recordedAt),
            unit: 'C',
          })),
          this.chartBlock('Presion arterial (mmHg)', this.buildPressureChartSvg(records)),
        ],
        columnGap: 10,
        margin: [0, 10, 0, 0],
      },
      { text: 'Lecturas registradas', style: 'section', margin: [0, 18, 0, 6] },
      this.recordsTable(records),
    ];

    if (latest) {
      content.splice(10, 0, this.latestReadingBlock(latest));
    }

    if (aiMessages.length) {
      content.push({ text: 'Mensajes clinicos IA', style: 'section', margin: [0, 18, 0, 6] });
      content.push({
        ul: aiMessages.map(
          (message) => `${this.formatDateTime(message.createdAt)} - ${message.message}`,
        ),
      });
    }

    return {
      pageSize: 'A4',
      pageMargins: [28, 28, 28, 28],
      content,
      defaultStyle: {
        fontSize: 9,
      },
      styles: {
        title: {
          fontSize: 20,
          bold: true,
        },
        section: {
          fontSize: 13,
          bold: true,
          margin: [0, 16, 0, 8],
        },
        muted: {
          color: '#64748b',
          margin: [0, 4, 0, 0],
        },
        cardTitle: {
          fontSize: 8,
          bold: true,
          color: '#475569',
        },
        metricValue: {
          fontSize: 16,
          bold: true,
          color: '#0f172a',
        },
      },
      footer: (currentPage, pageCount) => ({
        margin: [28, 0, 28, 12],
        columns: [
          { text: `Paciente: ${patient.user.fullname}`, color: '#64748b', fontSize: 8 },
          {
            text: `Pagina ${currentPage} de ${pageCount}`,
            alignment: 'right',
            color: '#64748b',
            fontSize: 8,
          },
        ],
      }),
    };
  }

  private buildFileName(session: Session): string {
    const date = this.formatDate(session.startedAt);
    const name = session.patient.user.fullname
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    return `reporte-sesion-${name || 'paciente'}-${date}-${session.id.slice(0, 8)}.pdf`;
  }

  private infoCard(title: string, value: string): any {
    return {
      width: '*',
      stack: [
        { text: title, style: 'cardTitle' },
        { text: value || 'Sin dato', margin: [0, 4, 0, 0] },
      ],
      margin: [0, 0, 0, 0],
    };
  }

  private metricCard(
    title: string,
    unit: string,
    stats: MetricStats,
    labels?: { avgLabel?: string; lastLabel?: string; rangeLabel?: string },
  ): any {
    return {
      width: '*',
      table: {
        body: [[{
          stack: [
            { text: title, style: 'cardTitle' },
            {
              text: `${labels?.lastLabel ?? this.formatStat(stats.last, 0)} ${unit}`.trim(),
              style: 'metricValue',
              margin: [0, 4, 0, 0],
            },
            {
              text: `Promedio: ${labels?.avgLabel ?? this.formatStat(stats.avg, 1)} ${unit}`.trim(),
              margin: [0, 6, 0, 0],
            },
            {
              text: `Rango: ${labels?.rangeLabel ?? `${this.formatStat(stats.min, 0)} - ${this.formatStat(stats.max, 0)}`}`,
              color: '#64748b',
            },
          ],
          fillColor: '#f8fafc',
          margin: [6, 6, 6, 6],
        }]],
      },
      layout: {
        hLineColor: () => '#e2e8f0',
        vLineColor: () => '#e2e8f0',
      },
    };
  }

  private latestReadingBlock(record: NonNullable<Session['records']>[number]): any {
    return {
      table: {
        widths: ['*'],
        body: [[{
          stack: [
            { text: 'Ultima lectura', style: 'cardTitle' },
            {
              text:
                `Pulso ${record.pulse ?? '-'} bpm  |  SpO2 ${record.oxygenSaturation ?? '-'} %  |  Temp ${record.temperatureC ?? '-'} C  |  PA ${record.systolic ?? '-'}/${record.diastolic ?? '-'}`,
              margin: [0, 4, 0, 0],
            },
          ],
          fillColor: '#eff6ff',
          margin: [8, 8, 8, 8],
        }]],
      },
      layout: {
        hLineColor: () => '#bfdbfe',
        vLineColor: () => '#bfdbfe',
      },
      margin: [0, 10, 0, 0],
    };
  }

  private chartBlock(title: string, svg: string): any {
    return {
      width: '*',
      stack: [{ text: title, style: 'cardTitle', margin: [0, 0, 0, 6] }, { svg }],
    };
  }

  private recordsTable(records: Session['records']): any {
    const body = [
      [
        'Hora',
        'Pulso',
        'SpO2',
        'Temp',
        'SYS',
        'DIA',
        'Alerta',
      ],
      ...records.map((record) => [
        this.formatTime(record.recordedAt),
        this.formatStat(record.pulse, 0),
        this.formatStat(record.oxygenSaturation, 0),
        this.formatStat(record.temperatureC, 1),
        this.formatStat(record.systolic, 0),
        this.formatStat(record.diastolic, 0),
        record.alertActive ? 'Si' : record.warningActive ? 'Aviso' : 'No',
      ]),
    ];

    return {
      table: {
        headerRows: 1,
        widths: [70, 50, 50, 50, 45, 45, '*'],
        body,
      },
      layout: 'lightHorizontalLines',
    };
  }

  private buildLineChartSvg(
    records: Session['records'],
    options: {
      color: string;
      values: Array<number | undefined>;
      labels: Array<string | Date>;
      unit: string;
    },
  ): string {
    const points = records
      .map((record, index) => ({
        value: Number(options.values[index]),
        label: options.labels[index] ?? record.recordedAt,
      }))
      .filter((point) => Number.isFinite(point.value));

    if (!points.length) {
      return this.emptyChartSvg();
    }

    const width = 240;
    const height = 130;
    const left = 28;
    const right = 10;
    const top = 10;
    const bottom = 24;
    const values = points.map((point) => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const paddedMin = min - Math.max(1, (max - min) * 0.12 || min * 0.05 || 1);
    const paddedMax = max + Math.max(1, (max - min) * 0.12 || max * 0.05 || 1);
    const xStep = points.length === 1 ? 0 : (width - left - right) / (points.length - 1);
    const toY = (value: number) => {
      const ratio = (value - paddedMin) / (paddedMax - paddedMin || 1);
      return height - bottom - ratio * (height - top - bottom);
    };

    const polyline = points
      .map((point, index) => `${left + index * xStep},${toY(point.value).toFixed(2)}`)
      .join(' ');

    const circles = points
      .map((point, index) => {
        const x = left + index * xStep;
        const y = toY(point.value).toFixed(2);
        return `<circle cx="${x.toFixed(2)}" cy="${y}" r="2.8" fill="${options.color}" />`;
      })
      .join('');

    const yLabels = [paddedMax, (paddedMax + paddedMin) / 2, paddedMin]
      .map(
        (value, index) =>
          `<text x="0" y="${top + index * ((height - top - bottom) / 2) + 4}" font-size="9" fill="#64748b">${this.escapeXml(this.formatNumber(value, 0))}</text>`,
      )
      .join('');

    const firstLabel = this.escapeXml(this.formatTime(points[0].label));
    const lastLabel = this.escapeXml(this.formatTime(points.at(-1)?.label ?? points[0].label));

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect x="0" y="0" width="${width}" height="${height}" rx="8" fill="#ffffff" stroke="#e2e8f0" />
      <line x1="${left}" y1="${top}" x2="${left}" y2="${height - bottom}" stroke="#cbd5e1" stroke-width="1" />
      <line x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}" stroke="#cbd5e1" stroke-width="1" />
      <line x1="${left}" y1="${top}" x2="${width - right}" y2="${top}" stroke="#f1f5f9" stroke-width="1" />
      <line x1="${left}" y1="${(top + height - bottom) / 2}" x2="${width - right}" y2="${(top + height - bottom) / 2}" stroke="#f1f5f9" stroke-width="1" />
      ${yLabels}
      <polyline fill="none" stroke="${options.color}" stroke-width="2.5" points="${polyline}" />
      ${circles}
      <text x="${left}" y="${height - 8}" font-size="9" fill="#64748b">${firstLabel}</text>
      <text x="${width - right}" y="${height - 8}" font-size="9" fill="#64748b" text-anchor="end">${lastLabel}</text>
      <text x="${width - right}" y="14" font-size="9" fill="#0f172a" text-anchor="end">Ultimo: ${this.escapeXml(this.formatNumber(points.at(-1)?.value ?? 0, 0))} ${this.escapeXml(options.unit)}</text>
    </svg>`;
  }

  private buildPressureChartSvg(records: Session['records']): string {
    const points = records
      .map((record) => ({
        label: record.recordedAt,
        systolic: Number(record.systolic),
        diastolic: Number(record.diastolic),
      }))
      .filter(
        (point) => Number.isFinite(point.systolic) && Number.isFinite(point.diastolic),
      );

    if (!points.length) {
      return this.emptyChartSvg();
    }

    const width = 240;
    const height = 130;
    const left = 28;
    const right = 10;
    const top = 10;
    const bottom = 24;
    const values = points.flatMap((point) => [point.systolic, point.diastolic]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const paddedMin = min - Math.max(3, (max - min) * 0.12 || 3);
    const paddedMax = max + Math.max(3, (max - min) * 0.12 || 3);
    const xStep = points.length === 1 ? 0 : (width - left - right) / (points.length - 1);
    const toY = (value: number) => {
      const ratio = (value - paddedMin) / (paddedMax - paddedMin || 1);
      return height - bottom - ratio * (height - top - bottom);
    };

    const toPolyline = (selector: (point: (typeof points)[number]) => number) =>
      points
        .map((point, index) => `${left + index * xStep},${toY(selector(point)).toFixed(2)}`)
        .join(' ');

    const firstLabel = this.escapeXml(this.formatTime(points[0].label));
    const lastLabel = this.escapeXml(this.formatTime(points.at(-1)?.label ?? points[0].label));

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect x="0" y="0" width="${width}" height="${height}" rx="8" fill="#ffffff" stroke="#e2e8f0" />
      <line x1="${left}" y1="${top}" x2="${left}" y2="${height - bottom}" stroke="#cbd5e1" stroke-width="1" />
      <line x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}" stroke="#cbd5e1" stroke-width="1" />
      <polyline fill="none" stroke="#7c3aed" stroke-width="2.5" points="${toPolyline((point) => point.systolic)}" />
      <polyline fill="none" stroke="#f97316" stroke-width="2.5" stroke-dasharray="5 3" points="${toPolyline((point) => point.diastolic)}" />
      <text x="0" y="14" font-size="9" fill="#64748b">${this.escapeXml(this.formatNumber(paddedMax, 0))}</text>
      <text x="0" y="${height - bottom + 4}" font-size="9" fill="#64748b">${this.escapeXml(this.formatNumber(paddedMin, 0))}</text>
      <text x="${left}" y="${height - 8}" font-size="9" fill="#64748b">${firstLabel}</text>
      <text x="${width - right}" y="${height - 8}" font-size="9" fill="#64748b" text-anchor="end">${lastLabel}</text>
      <text x="${width - right}" y="14" font-size="9" fill="#7c3aed" text-anchor="end">SYS ${this.escapeXml(this.formatNumber(points.at(-1)?.systolic ?? 0, 0))}</text>
      <text x="${width - right}" y="26" font-size="9" fill="#f97316" text-anchor="end">DIA ${this.escapeXml(this.formatNumber(points.at(-1)?.diastolic ?? 0, 0))}</text>
    </svg>`;
  }

  private emptyChartSvg(): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="130" viewBox="0 0 240 130"><rect x="0" y="0" width="240" height="130" rx="8" fill="#ffffff" stroke="#e2e8f0" /><text x="120" y="68" text-anchor="middle" font-size="11" fill="#94a3b8">Sin lecturas suficientes</text></svg>`;
  }

  private metricStats(values: Array<number | undefined>): MetricStats {
    const finite = values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
    if (!finite.length) {
      return { min: null, max: null, avg: null, last: null };
    }

    return {
      min: Math.min(...finite),
      max: Math.max(...finite),
      avg: finite.reduce((sum, value) => sum + value, 0) / finite.length,
      last: finite.at(-1) ?? null,
    };
  }

  private computeDurationMinutes(session: Session): number {
    const end = session.endedAt ? new Date(session.endedAt) : new Date();
    return Math.max(
      1,
      Math.round((end.getTime() - new Date(session.startedAt).getTime()) / 60_000),
    );
  }

  private formatDateTime(value: string | Date): string {
    return new Date(value).toLocaleString('es-ES');
  }

  private formatDate(value: string | Date): string {
    const date = new Date(value);
    const y = date.getFullYear();
    const m = `${date.getMonth() + 1}`.padStart(2, '0');
    const d = `${date.getDate()}`.padStart(2, '0');
    return `${y}${m}${d}`;
  }

  private formatTime(value: string | Date): string {
    return new Date(value).toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  private formatNumber(value: number, digits: number): string {
    return Number(value).toFixed(digits);
  }

  private formatStat(value: number | null | undefined, digits: number): string {
    if (value == null || !Number.isFinite(value)) return '-';
    return this.formatNumber(value, digits);
  }

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
