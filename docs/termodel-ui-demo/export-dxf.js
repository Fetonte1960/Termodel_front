// Termodel Web - esportazione CAD DXF v0.6
// Modulo volutamente generico: converte la geometria architettonica gia' prodotta
// da GeneraPianta Web in un DXF testuale AutoCAD 2013 (AC1027), unita' millimetri.
// Non contiene logica Termodel privata, archivi, DXF reader o calcoli termici.

const DXF_VERSION = 'AC1027';
const DXF_INSUNITS_MILLIMETERS = 4;
const SVG_CM_TO_DXF_MM = 10;

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number))
    throw new Error(`DXF: valore non numerico per ${label}.`);
  return number;
}

function collectPlanPoints(plan) {
  const points = [];

  const addRing = (ring) => {
    (ring || []).forEach(([x, y]) => {
      const px = Number(x);
      const py = Number(y);
      if (Number.isFinite(px) && Number.isFinite(py))
        points.push([px, py]);
    });
  };

  addRing(plan?.edificio?.outerShell);
  (plan?.locali || []).forEach(locale => addRing(locale.architecturalShell));

  if (!points.length)
    throw new Error('DXF: la pianta architettonica non contiene coordinate.');

  return points;
}

function createCoordinateTransform(plan) {
  const points = collectPlanPoints(plan);
  const xs = points.map(p => p[0]);
  const ys = points.map(p => p[1]);

  const minX = Math.min(...xs);
  const maxY = Math.max(...ys);

  // SVG ha Y positiva verso il basso; CAD usa Y positiva verso l'alto.
  // Portiamo inoltre l'estremo sinistro/inferiore vicino all'origine CAD.
  return ([x, y]) => [
    (finiteNumber(x, 'X') - minX) * SVG_CM_TO_DXF_MM,
    (maxY - finiteNumber(y, 'Y')) * SVG_CM_TO_DXF_MM
  ];
}

function pair(code, value) {
  return `${code}\r\n${value}\r\n`;
}

function dxfString(value) {
  const text = String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
  let result = '';

  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp >= 32 && cp <= 126 && ch !== '\\') {
      result += ch;
    } else if (cp <= 0xffff) {
      result += `\\U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
    } else {
      result += '?';
    }
  }

  return result;
}

function polylineEntity(layer, ring, transform) {
  if (!Array.isArray(ring) || ring.length < 3) return '';

  let out = '';
  out += pair(0, 'LWPOLYLINE');
  out += pair(100, 'AcDbEntity');
  out += pair(8, layer);
  out += pair(100, 'AcDbPolyline');
  out += pair(90, ring.length);
  out += pair(70, 1);

  ring.forEach(point => {
    const [x, y] = transform(point);
    out += pair(10, x.toFixed(3));
    out += pair(20, y.toFixed(3));
  });

  return out;
}

function textEntity(layer, x, y, text, transform, heightMm = 180) {
  const [tx, ty] = transform([x, y]);
  let out = '';
  out += pair(0, 'TEXT');
  out += pair(100, 'AcDbEntity');
  out += pair(8, layer);
  out += pair(100, 'AcDbText');
  out += pair(10, tx.toFixed(3));
  out += pair(20, ty.toFixed(3));
  out += pair(30, '0.0');
  out += pair(40, heightMm.toFixed(3));
  out += pair(1, dxfString(text));
  out += pair(50, '0.0');
  out += pair(7, 'STANDARD');
  return out;
}

function layerRecord(name, colorIndex) {
  let out = '';
  out += pair(0, 'LAYER');
  out += pair(100, 'AcDbSymbolTableRecord');
  out += pair(100, 'AcDbLayerTableRecord');
  out += pair(2, name);
  out += pair(70, 0);
  out += pair(62, colorIndex);
  out += pair(6, 'CONTINUOUS');
  return out;
}

function headerSection(extents) {
  let out = '';
  out += pair(0, 'SECTION');
  out += pair(2, 'HEADER');
  out += pair(9, '$ACADVER');
  out += pair(1, DXF_VERSION);
  out += pair(9, '$INSUNITS');
  out += pair(70, DXF_INSUNITS_MILLIMETERS);
  out += pair(9, '$MEASUREMENT');
  out += pair(70, 1);

  if (extents) {
    out += pair(9, '$EXTMIN');
    out += pair(10, extents.minX.toFixed(3));
    out += pair(20, extents.minY.toFixed(3));
    out += pair(30, '0.0');
    out += pair(9, '$EXTMAX');
    out += pair(10, extents.maxX.toFixed(3));
    out += pair(20, extents.maxY.toFixed(3));
    out += pair(30, '0.0');
  }

  out += pair(0, 'ENDSEC');
  return out;
}

function tablesSection() {
  const layers = [
    ['0', 7],
    ['TMD_PERIMETRO', 8],
    ['TMD_LOCALI', 7],
    ['TMD_TESTI', 2]
  ];

  let out = '';
  out += pair(0, 'SECTION');
  out += pair(2, 'TABLES');

  out += pair(0, 'TABLE');
  out += pair(2, 'LTYPE');
  out += pair(70, 1);
  out += pair(0, 'LTYPE');
  out += pair(100, 'AcDbSymbolTableRecord');
  out += pair(100, 'AcDbLinetypeTableRecord');
  out += pair(2, 'CONTINUOUS');
  out += pair(70, 0);
  out += pair(3, 'Solid line');
  out += pair(72, 65);
  out += pair(73, 0);
  out += pair(40, '0.0');
  out += pair(0, 'ENDTAB');

  out += pair(0, 'TABLE');
  out += pair(2, 'LAYER');
  out += pair(70, layers.length);
  layers.forEach(([name, color]) => {
    out += layerRecord(name, color);
  });
  out += pair(0, 'ENDTAB');

  out += pair(0, 'TABLE');
  out += pair(2, 'STYLE');
  out += pair(70, 1);
  out += pair(0, 'STYLE');
  out += pair(100, 'AcDbSymbolTableRecord');
  out += pair(100, 'AcDbTextStyleTableRecord');
  out += pair(2, 'STANDARD');
  out += pair(70, 0);
  out += pair(40, '0.0');
  out += pair(41, '1.0');
  out += pair(50, '0.0');
  out += pair(71, 0);
  out += pair(42, '2.5');
  out += pair(3, 'txt');
  out += pair(4, '');
  out += pair(0, 'ENDTAB');

  out += pair(0, 'ENDSEC');
  return out;
}

function emptyBlocksSection() {
  let out = '';
  out += pair(0, 'SECTION');
  out += pair(2, 'BLOCKS');
  out += pair(0, 'ENDSEC');
  return out;
}

function entitiesSection(plan, transform) {
  let out = '';
  out += pair(0, 'SECTION');
  out += pair(2, 'ENTITIES');

  // Filo esterno dell'edificio, gia' parallelizzato da GeneraPianta.
  out += polylineEntity('TMD_PERIMETRO', plan.edificio?.outerShell, transform);

  // Ogni locale netto e' una polilinea chiusa. Nel loro insieme questi
  // contorni descrivono anche le due facce dei divisori interni.
  (plan.locali || []).forEach(locale => {
    out += polylineEntity('TMD_LOCALI', locale.architecturalShell, transform);

    const label = locale.descrizione
      ? `${locale.id} - ${locale.descrizione}`
      : locale.id;

    out += textEntity(
      'TMD_TESTI',
      locale.x,
      locale.y,
      label,
      transform
    );
  });

  out += pair(0, 'ENDSEC');
  return out;
}

function computeExtents(plan, transform) {
  const transformed = collectPlanPoints(plan).map(transform);
  const xs = transformed.map(p => p[0]);
  const ys = transformed.map(p => p[1]);

  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys)
  };
}

export function generaDxfDaPianta(plan) {
  if (!plan?.edificio?.outerShell?.length)
    throw new Error('DXF: manca il perimetro esterno della pianta.');

  if (!Array.isArray(plan.locali) || !plan.locali.length)
    throw new Error('DXF: non risultano locali netti da esportare.');

  const transform = createCoordinateTransform(plan);
  const extents = computeExtents(plan, transform);

  let dxf = '';
  dxf += headerSection(extents);
  dxf += tablesSection();
  dxf += emptyBlocksSection();
  dxf += entitiesSection(plan, transform);
  dxf += pair(0, 'EOF');

  return dxf;
}

export const DXF_EXPORT_INFO = Object.freeze({
  version: 'AutoCAD 2013 / AC1027',
  units: 'millimeters',
  layers: ['TMD_PERIMETRO', 'TMD_LOCALI', 'TMD_TESTI']
});
