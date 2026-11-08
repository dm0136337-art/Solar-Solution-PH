import type { Place, SolarResult } from './SolarLocationCard';
import type { SolarPanelResult } from './SolarPanelCapacityCard';
import type { InverterResult } from './InverterCapacityCard';
import type { BatteryResult, BatterySettings } from './BatteryStorageCapacityCard';

type Props = {
  place: Place | null; solar: SolarResult | null; energyWh: number; applianceCount: number; connectedLoadW: number;
  panelWatts: number | null; panel: SolarPanelResult | null; inverter: InverterResult | null;
  battery: BatteryResult | null; batterySettings: BatterySettings;
};
type ReportSection = readonly [string, readonly (readonly [string, string])[]];
const fmt = (value: number, digits = 2) => value.toLocaleString(undefined, { maximumFractionDigits: digits });
const missing = 'Not yet calculated';

function ascii(input: string) {
  return input.normalize('NFKD').replace(/[^\x20-\x7E]/g, '-').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function makePdf(sections: readonly ReportSection[], finalRequirements: readonly (readonly [string, string])[], assumptions: readonly (readonly [string, string])[]) {
  const pages: string[][] = [[]];
  let y = 794;
  const add = (command: string, height = 14) => {
    if (y < 55) { pages.push([]); y = 794; }
    pages[pages.length - 1].push(command);
    y -= height;
  };
  const text = (value: string, x: number, baseline: number, size: number, bold = false) => `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${baseline} Td (${ascii(value)}) Tj ET`;
  add(text('Solar Solution PH - Off-Grid Solar System Assessment', 48, y, 19, true), 27);
  add(text(`Assessment date: ${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`, 48, y, 9), 21);
  add('q 0.96 0.97 0.93 rg 48 690 499 62 re f Q');
  add(text('FINAL SYSTEM REQUIREMENTS', 60, 733, 10, true), 16);
  for (const [label, value] of finalRequirements) add(text(`${label}: ${value}`, 60, y, 9, true), 14);
  y -= 4;
  for (const [title, entries] of [...sections, ['Important Calculation Assumptions', assumptions] as ReportSection]) {
    if (y < 110) { pages.push([]); y = 794; }
    add(`q 0.91 0.93 0.89 RG 48 ${y - 3} m 547 ${y - 3} l S Q`);
    add(text(title, 48, y - 1, 12, true), 20);
    for (const [label, value] of entries) {
      if (y < 58) { pages.push([]); y = 794; }
      add(text(label.slice(0, 58), 52, y, 8.5), 13);
      const pieces = value.match(/.{1,48}(?:\s|$)/g) ?? [value];
      pieces.forEach((piece, index) => add(text(piece.trim(), 310, y + (index ? 0 : 0), 8.5, true), index === pieces.length - 1 ? 8 : 11));
      add(`q 0.91 0.93 0.89 RG 48 ${y + 3} m 547 ${y + 3} l S Q`, 8);
    }
    y -= 5;
  }
  const objects: string[] = [];
  const addObject = (body: string) => { objects.push(body); return objects.length; };
  const catalogId = addObject('');
  const pagesId = addObject('');
  const fontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const boldFontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const pageIds = pages.map((commands) => {
    const stream = commands.join('\n');
    const contentId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    return addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
  });
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Blob([pdf], { type: 'application/pdf' });
}

export default function SystemSummaryCard({ place, solar, energyWh, applianceCount, connectedLoadW, panelWatts, panel, inverter, battery, batterySettings }: Props) {
  const sections: readonly ReportSection[] = [
    ['Solar Location & Irradiation', [
      ['Selected location', place?.label ?? missing], ['Peak Sun Hours (PSH)', solar ? `${fmt(solar.design)} h/day` : missing],
      ['Daily solar irradiation', solar ? `${fmt(solar.design)} kWh/m2/day` : missing],
    ]],
    ['Appliance Energy Consumption', [
      ['Total number of appliances', applianceCount ? String(applianceCount) : missing], ['Total connected appliance load', connectedLoadW > 0 ? `${fmt(connectedLoadW)} W` : missing],
      ['Daily energy consumption', energyWh > 0 ? `${fmt(energyWh)} Wh/day` : missing], ['Daily energy consumption', energyWh > 0 ? `${fmt(energyWh / 1000, 3)} kWh/day` : missing],
    ]],
    ['Solar Panel System', [
      ['Available solar panel wattage', panelWatts ? `${fmt(panelWatts)} W` : missing], ['Required Solar Panel Capacity', panel ? `${fmt(panel.requiredWp, 1)} W` : missing],
      ['Recommended number of solar panels', panel ? String(panel.panelCount) : missing], ['Total installed solar capacity', panel ? `${fmt(panel.installedWp)} W` : missing],
      ['Estimated daily solar production', panel ? `${fmt(panel.productionWh, 1)} Wh/day` : missing], ['Estimated daily solar production', panel ? `${fmt(panel.productionWh / 1000, 3)} kWh/day` : missing], ['Performance Ratio', '70%'],
    ]],
    ['Inverter System', [
      ['Total connected load', inverter ? `${fmt(inverter.totalLoadW)} W` : missing], ['Design margin', '25%'], ['Required inverter capacity', inverter ? `${fmt(inverter.requiredW)} W` : missing],
      ['Recommended inverter size', inverter ? `${fmt(inverter.recommendedW)} W` : missing], ['Recommended inverter size', inverter ? `${fmt(inverter.recommendedW / 1000)} kW` : missing],
    ]],
    ['Battery Storage System', [
      ['Selected battery bank voltage', batterySettings.voltage ? `${fmt(batterySettings.voltage, 0)} V` : missing], ['Battery chemistry', batterySettings.chemistry],
      ['Backup duration', batterySettings.backupDays ? `${fmt(batterySettings.backupDays)} days` : missing], ['Battery reserve', `${batterySettings.reservePercent ?? 30}%`],
      ['Required battery storage capacity', battery ? `${fmt(battery.requiredWh)} Wh` : missing], ['Required battery storage capacity', battery ? `${fmt(battery.requiredWh / 1000)} kWh` : missing],
      ['Required battery bank capacity', battery ? `${fmt(battery.requiredAh)} Ah` : missing],
    ]],
  ];
  const finalRequirements = [
    ['Solar array', panel ? `${fmt(panel.installedWp)} W installed` : missing],
    ['Inverter', inverter ? `${fmt(inverter.recommendedW)} W (${fmt(inverter.recommendedW / 1000)} kW)` : missing],
    ['Battery storage', battery ? `${fmt(battery.requiredWh)} Wh (${fmt(battery.requiredWh / 1000)} kWh)` : missing],
  ] as const;
  const assumptions = [['Solar Performance Ratio', '70%'], ['Inverter Design Margin', '25%'], ['Battery Reserve', '30%']] as const;
  function download() {
    const url = URL.createObjectURL(makePdf(sections, finalRequirements, assumptions));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'solar-solution-ph-assessment.pdf';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section className="capacity-card system-summary-card" aria-labelledby="system-summary-heading">
    <header className="capacity-card-heading"><div><h2 id="system-summary-heading">System Summary &amp; Report</h2><p>Live estimate and final system requirements.</p></div></header>
    <button className="summary-download-button" type="button" onClick={download}>Download Summary Report (PDF)</button>
    <div className="summary-sections">{sections.map(([title, entries]) => <details className="summary-section" key={title}><summary>{title}</summary><dl>{entries.map(([label, value], index) => <div key={`${label}-${index}`}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></details>)}</div>
  </section>;
}
