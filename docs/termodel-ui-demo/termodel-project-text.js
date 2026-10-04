// Termodel Web v0.73 — conversione bidirezionale TERMODEL-PROJECT-TEXT-V1.
// Il progetto unico resta il contenitore; questo modulo aggiorna soltanto le
// sezioni modificate dal frontend e conserva tutte le altre sezioni.
// Gli sfondi locali sono consolidati in assets/backgrounds/* e vengono
// reidratati nel CAD soltanto all'apertura del progetto.

export const TERMODEL_PROJECT_START = '[TERMODEL-PROJECT-TEXT-V1]';
export const TERMODEL_PROJECT_END = '[END-TERMODEL-PROJECT-TEXT-V1]';
export const TERMODEL_BACKGROUND_INDEX_SECTION = 'assets/backgrounds/index.json';
export const TERMODEL_BACKGROUND_SECTION_PREFIX = 'assets/backgrounds/';

const ARCHIVE_ARRAY_KEYS = [
  'records', 'Records',
  'items', 'Items',
  'data', 'Data',
  'dataCollection', 'DataCollection',
  'rows', 'Rows'
];

function normalizeSource(source) {
  return String(source == null ? '' : source).replace(/\r\n?/g, '\n').trim();
}

export function isTermodelProjectText(text) {
  const source = String(text == null ? '' : text).toUpperCase();
  return source.includes(TERMODEL_PROJECT_START) && source.includes(TERMODEL_PROJECT_END);
}

export function parseTermodelProjectText(source) {
  const normalized = normalizeSource(source);
  if (!isTermodelProjectText(normalized))
    throw new Error('File progetto TERMODEL-PROJECT-TEXT-V1 non valido o incompleto.');

  const lines = normalized.split('\n');
  const sections = new Map();
  const sectionOrder = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^---BEGIN:(.+)---\s*$/);
    if (!match) continue;

    const name = match[1].trim();
    const expectedEnd = '---END:' + name + '---';
    const body = [];
    let closed = false;

    for (i = i + 1; i < lines.length; i++) {
      if (lines[i].trim() === expectedEnd) {
        closed = true;
        break;
      }
      body.push(lines[i]);
    }

    if (!closed)
      throw new Error('Sezione progetto non chiusa: ' + name + '.');

    sections.set(name, body.join('\n').replace(/\n+$/, ''));
    sectionOrder.push(name);
  }

  if (!sections.size)
    throw new Error('Il progetto TERMODEL-PROJECT-TEXT-V1 non contiene sezioni.');

  return { source: normalized, sections, sectionOrder };
}

export function getTermodelProjectSection(source, sectionName) {
  return parseTermodelProjectText(source).sections.get(sectionName) || '';
}

export function replaceTermodelProjectSection(source, sectionName, sectionText) {
  const normalized = normalizeSource(source);
  const begin = '---BEGIN:' + sectionName + '---';
  const end = '---END:' + sectionName + '---';
  const beginIndex = normalized.indexOf(begin);
  if (beginIndex < 0)
    throw new Error('Il progetto non contiene la sezione ' + sectionName + '.');

  const bodyStart = beginIndex + begin.length;
  const endIndex = normalized.indexOf(end, bodyStart);
  if (endIndex < 0)
    throw new Error('La sezione ' + sectionName + ' del progetto non è chiusa.');

  return normalized.slice(0, bodyStart) +
    '\n' + String(sectionText == null ? '' : sectionText).trim() + '\n' +
    normalized.slice(endIndex);
}

export function setTermodelProjectSection(source, sectionName, sectionText) {
  const normalized = normalizeSource(source);
  const parsed = parseTermodelProjectText(normalized);
  if (parsed.sections.has(sectionName))
    return replaceTermodelProjectSection(normalized, sectionName, sectionText);

  const endIndex = normalized.lastIndexOf(TERMODEL_PROJECT_END);
  if (endIndex < 0)
    throw new Error('Chiusura TERMODEL-PROJECT-TEXT-V1 non trovata.');

  const prefix = normalized.slice(0, endIndex).replace(/\s+$/, '');
  const suffix = normalized.slice(endIndex);
  return (
    prefix +
    '\n\n---BEGIN:' + sectionName + '---\n' +
    String(sectionText == null ? '' : sectionText).trim() +
    '\n---END:' + sectionName + '---\n\n' +
    suffix
  );
}

export function removeTermodelProjectSection(source, sectionName) {
  const normalized = normalizeSource(source);
  const begin = '---BEGIN:' + sectionName + '---';
  const end = '---END:' + sectionName + '---';
  const beginIndex = normalized.indexOf(begin);
  if (beginIndex < 0) return normalized;

  const endIndex = normalized.indexOf(end, beginIndex + begin.length);
  if (endIndex < 0)
    throw new Error('La sezione ' + sectionName + ' del progetto non è chiusa.');

  let before = normalized.slice(0, beginIndex).replace(/[ \t]*\n?$/, '');
  let after = normalized.slice(endIndex + end.length).replace(/^\s*/, '');
  return before + '\n\n' + after;
}

function safeBackgroundId(value, fallback) {
  const clean = String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return clean || fallback;
}

function dataUrlMimeType(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;,]+)[;,]/i);
  return match ? match[1].toLowerCase() : 'application/octet-stream';
}

export function consolidateTermodelBackgrounds(geometrySvg) {
  const source = String(geometrySvg || '');
  if (!source.trim())
    return { geometrySvg: source, backgrounds: [] };

  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined')
    throw new Error('DOM XML non disponibile: impossibile consolidare gli sfondi.');

  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (doc.querySelector('parsererror'))
    throw new Error('geometry/project.svg non è XML valido.');

  const images = Array.from(doc.querySelectorAll('image[data-termodel-sfondo="1"]'));
  const backgrounds = [];
  const usedIds = new Set();

  images.forEach((image, index) => {
    const fallback = 'BG' + String(index + 1).padStart(3, '0');
    let id = safeBackgroundId(image.getAttribute('data-termodel-background-id'), fallback);
    if (usedIds.has(id)) {
      let suffix = 2;
      const base = id;
      while (usedIds.has(base + '_' + suffix)) suffix++;
      id = base + '_' + suffix;
    }
    usedIds.add(id);
    image.setAttribute('data-termodel-background-id', id);

    const href =
      image.getAttribute('href') ||
      image.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ||
      '';

    if (!/^data:/i.test(href))
      return;

    const section = TERMODEL_BACKGROUND_SECTION_PREFIX + id + '.data';
    backgrounds.push({
      id,
      plane: image.getAttribute('data-termodel-piano') || '',
      layer: image.getAttribute('data-termodel-layer') || '',
      fileName: image.getAttribute('data-termodel-nome-file') || '',
      kind: image.getAttribute('data-termodel-sfondo-tipo') || '',
      mimeType: dataUrlMimeType(href),
      section,
      dataUrl: href
    });

    image.removeAttribute('href');
    image.removeAttributeNS('http://www.w3.org/1999/xlink', 'href');
  });

  return {
    geometrySvg: new XMLSerializer().serializeToString(doc.documentElement),
    backgrounds
  };
}

export function hydrateTermodelBackgrounds(projectText, geometrySvg) {
  const source = String(geometrySvg || '');
  if (!source.trim()) return source;

  const parsed = parseTermodelProjectText(projectText);
  const rawIndex = parsed.sections.get(TERMODEL_BACKGROUND_INDEX_SECTION);
  if (!rawIndex) return source;

  let index;
  try {
    index = JSON.parse(rawIndex);
  } catch (error) {
    throw new Error('Indice sfondi non valido: ' + error.message);
  }

  const records = Array.isArray(index?.backgrounds) ? index.backgrounds : [];
  if (!records.length) return source;

  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined')
    throw new Error('DOM XML non disponibile: impossibile ripristinare gli sfondi.');

  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (doc.querySelector('parsererror'))
    throw new Error('geometry/project.svg non è XML valido.');

  const images = Array.from(doc.querySelectorAll('image[data-termodel-sfondo="1"]'));

  records.forEach((record) => {
    const id = String(record?.id || '');
    const section = String(record?.section || '');
    if (!id || !section) return;

    const image = images.find(item =>
      item.getAttribute('data-termodel-background-id') === id
    );
    const dataUrl = parsed.sections.get(section);
    if (!image || !dataUrl || !/^data:/i.test(dataUrl)) return;

    image.setAttribute('href', dataUrl);
  });

  return new XMLSerializer().serializeToString(doc.documentElement);
}

const TERMODEL_PROJECT_SVG_FORMAT = 'TERMODEL-PROJECT-SVG-V1';
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

function parseProjectManifest(parsed) {
  const raw = parsed.sections.get('manifest.json');
  if (!raw) throw new Error('Il progetto non contiene manifest.json.');
  try {
    const manifest = JSON.parse(raw);
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest))
      throw new Error('radice non valida');
    return manifest;
  } catch (error) {
    throw new Error('manifest.json non valido: ' + error.message);
  }
}

function readServerFloors(parsed) {
  const manifest = parseProjectManifest(parsed);
  const manifestFloors = Array.isArray(manifest.floors) ? manifest.floors : [];
  let piani = [];

  const rawPiani = parsed.sections.get('archives/json/Piani.json');
  if (rawPiani) {
    try {
      piani = parseArchiveJsonShape(rawPiani).records || [];
    } catch (_) {
      piani = [];
    }
  }

  const count = Math.max(manifestFloors.length, piani.length);
  if (!count)
    throw new Error('Il progetto non contiene piani utilizzabili dal Service.');

  return Array.from({ length: count }, (_, index) => {
    const mf = manifestFloors[index] && typeof manifestFloors[index] === 'object'
      ? manifestFloors[index]
      : {};
    const pr = piani[index] && typeof piani[index] === 'object'
      ? piani[index]
      : {};

    const id = String(mf.id || ('F' + String(index + 1).padStart(3, '0'))).trim();
    const name = String(pr.Nome ?? mf.name ?? '').trim();
    const type = String(pr.Tipo ?? mf.type ?? '').trim();
    const fileName = String(pr.NomeFile ?? mf.fileName ?? '').trim();
    const layer = String(pr.LayerCad ?? mf.cadLayer ?? '').trim();
    const role = type.toLowerCase();

    if (!id || !name || !fileName || !layer)
      throw new Error('Piano ' + (index + 1) + ': metadati incompleti per il payload Service.');
    if (role !== 'calpestabile' && role !== 'copertura')
      throw new Error(
        'Piano "' + name + '": Tipo deve essere Calpestabile oppure Copertura.'
      );

    return {
      id,
      name,
      role,
      fileName,
      layer,
      order: Number.isInteger(Number(mf.order)) ? Number(mf.order) : index
    };
  }).sort((a, b) => a.order - b.order);
}

function sameProjectToken(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function technicalBlockText(element) {
  if (!element || element.localName !== 'text') return false;
  const rows = Array.from(element.children || [])
    .filter(child => child.localName === 'tspan')
    .map(child => String(child.textContent || '').trim())
    .filter(Boolean);
  const first = rows[0] || String(element.textContent || '').trim();
  return /^BLOCCO\s*,/i.test(first);
}

function technicalSvgChildren(group) {
  if (!group) return [];
  return Array.from(group.children || []).filter((element) =>
    element.localName === 'line' ||
    (element.localName === 'text' && technicalBlockText(element))
  );
}

function cloneSvgTechnicalNode(targetDocument, source) {
  const clone = targetDocument.createElementNS(SVG_NAMESPACE, source.localName);

  Array.from(source.attributes || []).forEach((attribute) => {
    if (attribute.name === 'xmlns') return;
    clone.setAttribute(attribute.name, attribute.value);
  });

  Array.from(source.childNodes || []).forEach((child) => {
    if (child.nodeType === 1) {
      clone.appendChild(cloneSvgTechnicalNode(targetDocument, child));
    } else if (child.nodeType === 3 || child.nodeType === 4) {
      clone.appendChild(targetDocument.createTextNode(child.nodeValue || ''));
    }
  });

  return clone;
}

function normalizeServerLineAttributes(line, floor) {
  if (!line || line.localName !== 'line') return;

  if (!String(line.getAttribute('data-termodel-layer') || '').trim())
    line.setAttribute('data-termodel-layer', floor.layer);

  if (!String(line.getAttribute('data-termodel-linetype') || '').trim()) {
    const localType = String(line.getAttribute('data-termodel-tipo-linea') || '').trim();
    if (localType) line.setAttribute('data-termodel-linetype', localType);
  }

  if (!String(line.getAttribute('data-termodel-color') || '').trim()) {
    const localColor = String(line.getAttribute('data-termodel-colore') || '').trim();
    const match = localColor.match(/^\s*(\d+)/);
    if (match) line.setAttribute('data-termodel-color', match[1]);
  }
}

function localElementBelongsToFloor(element, floor, floorCount) {
  const plane = String(element.getAttribute('data-termodel-piano') || '').trim();
  if (plane)
    return sameProjectToken(plane, floor.name) || sameProjectToken(plane, floor.id);

  const layer = String(element.getAttribute('data-termodel-layer') || '').trim();
  if (layer && floor.layer)
    return sameProjectToken(layer, floor.layer);

  // Gli SVG-LFT storici non avevano metadati di piano sulle singole entità.
  // Il fallback è sicuro soltanto quando il progetto ha un unico piano.
  return floorCount === 1;
}

function buildCanonicalServerGeometry(projectText, geometrySvg) {
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined')
    throw new Error('DOM XML non disponibile: impossibile preparare geometry/project.svg.');

  const project = parseTermodelProjectText(projectText);
  const floors = readServerFloors(project);

  const sourceDoc = new DOMParser().parseFromString(String(geometrySvg || ''), 'image/svg+xml');
  if (sourceDoc.querySelector('parsererror'))
    throw new Error('geometry/project.svg non è XML valido.');

  const sourceRoot = sourceDoc.documentElement;
  if (!sourceRoot || sourceRoot.localName !== 'svg')
    throw new Error('geometry/project.svg non contiene una radice SVG.');

  const outputDoc = new DOMParser().parseFromString(
    '<svg xmlns="' + SVG_NAMESPACE + '"></svg>',
    'image/svg+xml'
  );
  const outputRoot = outputDoc.documentElement;
  outputRoot.setAttribute('version', '1.1');
  outputRoot.setAttribute('data-termodel-format', TERMODEL_PROJECT_SVG_FORMAT);
  outputRoot.setAttribute('data-termodel-units', 'cm');

  const directGroups = Array.from(sourceRoot.children || [])
    .filter(element => element.localName === 'g');

  const canonicalGroups = directGroups.filter(group =>
    String(group.getAttribute('data-termodel-floor-id') || '').trim()
  );

  const legacyTechnicalElements = directGroups
    .filter(group => ['calpestabile', 'copertura'].includes(String(group.id || '').toLowerCase()))
    .flatMap(group => technicalSvgChildren(group));

  let sourceTechnicalCount = canonicalGroups.length
    ? canonicalGroups.reduce((count, group) => count + technicalSvgChildren(group).length, 0)
    : legacyTechnicalElements.length;
  let assignedTechnicalCount = 0;

  floors.forEach((floor) => {
    const outputGroup = outputDoc.createElementNS(SVG_NAMESPACE, 'g');
    outputGroup.setAttribute(
      'id',
      'floor-' + floor.id.replace(/[^A-Za-z0-9_-]+/g, '_')
    );
    outputGroup.setAttribute('data-termodel-floor-id', floor.id);
    outputGroup.setAttribute('data-termodel-name', floor.name);
    outputGroup.setAttribute('data-termodel-role', floor.role);
    outputGroup.setAttribute('data-termodel-file', floor.fileName);
    outputGroup.setAttribute('data-termodel-layer', floor.layer);
    outputGroup.setAttribute('data-termodel-order', String(floor.order));

    let sourceGroup = null;
    let candidates = [];

    if (canonicalGroups.length) {
      sourceGroup = canonicalGroups.find(group =>
        sameProjectToken(group.getAttribute('data-termodel-floor-id'), floor.id) ||
        sameProjectToken(group.getAttribute('data-termodel-name'), floor.name)
      ) || null;

      candidates = technicalSvgChildren(sourceGroup);
    } else {
      // Lo SVG operativo del CAD Web usa storicamente un contenitore comune
      // "calpestabile" anche quando il progetto diventa multipiano. L'identità
      // reale del piano è data dai metadati data-termodel-piano/layer.
      // Per questo non si deduce il ruolo dal nome del gruppo locale.
      candidates = legacyTechnicalElements.filter(element =>
        localElementBelongsToFloor(element, floor, floors.length)
      );
    }

    candidates.forEach((element) => {
      const clone = cloneSvgTechnicalNode(outputDoc, element);
      if (clone.localName === 'line')
        normalizeServerLineAttributes(clone, floor);
      else if (!String(clone.getAttribute('data-termodel-layer') || '').trim())
        clone.setAttribute('data-termodel-layer', floor.layer);

      outputGroup.appendChild(clone);
      assignedTechnicalCount++;
    });

    outputRoot.appendChild(outputGroup);
  });

  if (sourceTechnicalCount > 0 && assignedTechnicalCount === 0)
    throw new Error(
      'Nessuna entità tecnica dello SVG CAD è associabile ai piani del progetto.'
    );

  return new XMLSerializer().serializeToString(outputRoot);
}

function validateCanonicalServerGeometry(geometrySvg) {
  const doc = new DOMParser().parseFromString(String(geometrySvg || ''), 'image/svg+xml');
  if (doc.querySelector('parsererror'))
    throw new Error('geometry/project.svg tecnico non è XML valido.');

  const root = doc.documentElement;
  if (root.namespaceURI !== SVG_NAMESPACE || root.localName !== 'svg')
    throw new Error('geometry/project.svg tecnico non usa il namespace SVG.');
  if (root.getAttribute('data-termodel-format') !== TERMODEL_PROJECT_SVG_FORMAT)
    throw new Error('geometry/project.svg tecnico non dichiara TERMODEL-PROJECT-SVG-V1.');
  if (String(root.getAttribute('data-termodel-units') || '').toLowerCase() !== 'cm')
    throw new Error("geometry/project.svg tecnico non dichiara data-termodel-units='cm'.");

  const groups = Array.from(root.children || []).filter(element => element.localName === 'g');
  if (!groups.length)
    throw new Error('geometry/project.svg tecnico non contiene gruppi di piano.');

  const required = [
    'data-termodel-floor-id',
    'data-termodel-name',
    'data-termodel-role',
    'data-termodel-file',
    'data-termodel-layer',
    'data-termodel-order'
  ];
  groups.forEach((group, index) => {
    required.forEach((name) => {
      if (!String(group.getAttribute(name) || '').trim())
        throw new Error('Piano ' + (index + 1) + ': attributo SVG obbligatorio ' + name + ' mancante.');
    });
  });
}

function stripTermodelBackgroundElements(geometrySvg) {
  const source = String(geometrySvg || '');
  if (!source.trim()) return source;

  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined')
    throw new Error('DOM XML non disponibile: impossibile filtrare gli sfondi per il Service.');

  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (doc.querySelector('parsererror'))
    throw new Error('geometry/project.svg non è XML valido.');

  doc.querySelectorAll(
    'image[data-termodel-sfondo="1"], image[data-termodel-background-id]'
  ).forEach(image => image.remove());

  return new XMLSerializer().serializeToString(doc.documentElement);
}

// Termodel Web v0.75: deriva dal progetto locale completo il payload tecnico
// previsto dal contratto Frontend <-> Service. Lo SVG operativo del CAD resta
// locale; nel payload viene costruito TERMODEL-PROJECT-SVG-V1 canonico.
export async function buildTermodelServerPayload(source) {
  let result = normalizeSource(source);
  let parsed = parseTermodelProjectText(result);

  for (const name of parsed.sectionOrder) {
    if (name.startsWith(TERMODEL_BACKGROUND_SECTION_PREFIX))
      result = removeTermodelProjectSection(result, name);
  }

  parsed = parseTermodelProjectText(result);
  const geometrySvg = parsed.sections.get('geometry/project.svg');
  if (!geometrySvg)
    throw new Error('Il progetto non contiene geometry/project.svg.');

  const localWithoutBackgrounds = stripTermodelBackgroundElements(geometrySvg);
  const serverGeometry = buildCanonicalServerGeometry(result, localWithoutBackgrounds);
  validateCanonicalServerGeometry(serverGeometry);

  result = replaceTermodelProjectSection(
    result,
    'geometry/project.svg',
    serverGeometry
  );

  result = await refreshManifest(result);

  const verify = parseTermodelProjectText(result);
  if (verify.sectionOrder.some(name => name.startsWith(TERMODEL_BACKGROUND_SECTION_PREFIX)))
    throw new Error('Il payload Service contiene ancora sezioni di sfondo locali.');

  return result;
}

function parseArchiveJsonShape(sectionText) {
  let parsed;
  try {
    parsed = JSON.parse(sectionText);
  } catch (error) {
    throw new Error('Archivio JSON non valido: ' + error.message);
  }

  if (Array.isArray(parsed))
    return { root: parsed, key: '', records: parsed };

  if (!parsed || typeof parsed !== 'object')
    throw new Error('Archivio JSON non valido.');

  for (const key of ARCHIVE_ARRAY_KEYS) {
    if (Array.isArray(parsed[key]))
      return { root: parsed, key, records: parsed[key] };
  }

  return { root: parsed, key: '', records: [parsed], singleObject: true };
}

function buildJsonTypeMap(templateRecords) {
  const types = new Map();
  for (const record of templateRecords || []) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) continue;
    for (const [key, value] of Object.entries(record)) {
      if (value === null || value === undefined || types.has(key)) continue;
      types.set(key, typeof value);
    }
  }
  return types;
}

function coerceJsonValue(value, type) {
  if (value === null || value === undefined) return value;
  if (type === 'number') {
    const numeric = Number(String(value).replace(',', '.'));
    return Number.isFinite(numeric) ? numeric : value;
  }
  if (type === 'boolean') {
    if (value === true || value === false) return value;
    const text = String(value).trim().toLowerCase();
    if (text === 'true') return true;
    if (text === 'false') return false;
  }
  return value;
}

function typedArchiveRecords(originalJson, records) {
  const shape = parseArchiveJsonShape(originalJson);
  const typeMap = buildJsonTypeMap(shape.records);
  return (records || []).map((record) => {
    const output = {};
    for (const [key, value] of Object.entries(record || {}))
      output[key] = coerceJsonValue(value, typeMap.get(key));
    return output;
  });
}

function serializeArchiveJson(originalJson, records) {
  const shape = parseArchiveJsonShape(originalJson);
  const typed = typedArchiveRecords(originalJson, records);

  if (Array.isArray(shape.root))
    return JSON.stringify(typed, null, 2);

  if (shape.key) {
    const root = { ...shape.root, [shape.key]: typed };
    return JSON.stringify(root, null, 2);
  }

  if (shape.singleObject)
    return JSON.stringify(typed[0] || {}, null, 2);

  return JSON.stringify(typed, null, 2);
}

function decodeXml(text) {
  return String(text == null ? '' : text)
    .replace(/&#x([0-9a-f]+);/gi, (_, value) => String.fromCodePoint(parseInt(value, 16)))
    .replace(/&#([0-9]+);/g, (_, value) => String.fromCodePoint(parseInt(value, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function encodeXml(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function parseArchiveXmlTemplate(xmlText) {
  const rows = [];
  const globalTypes = new Map();
  const rowRegex = /<ArrayOfKeyValueOfstringanyType>([\s\S]*?)<\/ArrayOfKeyValueOfstringanyType>/g;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(String(xmlText || ''))) !== null) {
    const row = { order: [], values: {}, types: {} };
    const kvRegex = /<KeyValueOfstringanyType>([\s\S]*?)<\/KeyValueOfstringanyType>/g;
    let kvMatch;

    while ((kvMatch = kvRegex.exec(rowMatch[1])) !== null) {
      const block = kvMatch[1];
      const keyMatch = block.match(/<Key>([\s\S]*?)<\/Key>/);
      if (!keyMatch) continue;
      const key = decodeXml(keyMatch[1]);
      row.order.push(key);

      const selfClosing = block.match(/<Value\b([^>]*)\/>/);
      const full = block.match(/<Value\b([^>]*)>([\s\S]*?)<\/Value>/);
      const attrs = selfClosing ? selfClosing[1] : (full ? full[1] : '');
      const typeMatch = attrs.match(/i:type="d4p1:([^"]+)"/);
      const type = typeMatch ? typeMatch[1] : '';
      if (type) {
        row.types[key] = type;
        if (!globalTypes.has(key)) globalTypes.set(key, type);
      }

      if (/i:nil="true"/.test(attrs))
        row.values[key] = null;
      else if (full)
        row.values[key] = decodeXml(full[2]);
      else
        row.values[key] = '';
    }

    rows.push(row);
  }

  return { rows, globalTypes };
}

function inferXmlType(value, key, templateRow, globalTypes) {
  const fromRow = templateRow && templateRow.types ? templateRow.types[key] : '';
  if (fromRow) return fromRow;
  const global = globalTypes.get(key);
  if (global) return global;
  if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'double';
  if (typeof value === 'boolean') return 'boolean';
  return 'string';
}

function formatXmlScalar(value, type) {
  if (type === 'boolean')
    return value === true || String(value).toLowerCase() === 'true' ? 'true' : 'false';
  if (type === 'int') {
    const numeric = Number(String(value).replace(',', '.'));
    return Number.isFinite(numeric) ? String(Math.trunc(numeric)) : String(value);
  }
  if (type === 'double' || type === 'float' || type === 'decimal') {
    const numeric = Number(String(value).replace(',', '.'));
    return Number.isFinite(numeric) ? String(numeric) : String(value);
  }
  return String(value);
}

function serializeArchiveXml(originalXml, records) {
  const template = parseArchiveXmlTemplate(originalXml);
  const output = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<ArrayOfArrayOfKeyValueOfstringanyType xmlns:i="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://schemas.microsoft.com/2003/10/Serialization/Arrays">'
  ];

  (records || []).forEach((record, index) => {
    const templateRow = template.rows[index] || { order: [], values: {}, types: {} };
    const keys = [];
    for (const key of templateRow.order || []) {
      if (!keys.includes(key)) keys.push(key);
    }
    for (const key of Object.keys(record || {})) {
      if (!keys.includes(key)) keys.push(key);
    }

    output.push('  <ArrayOfKeyValueOfstringanyType>');

    for (const key of keys) {
      const hasCurrent = Object.prototype.hasOwnProperty.call(record || {}, key);
      const value = hasCurrent ? record[key] : templateRow.values[key];
      const type = inferXmlType(value, key, templateRow, template.globalTypes);

      output.push('    <KeyValueOfstringanyType>');
      output.push('      <Key>' + encodeXml(key) + '</Key>');

      if (value === null || value === undefined) {
        output.push('      <Value i:nil="true" />');
      } else {
        output.push(
          '      <Value xmlns:d4p1="http://www.w3.org/2001/XMLSchema" i:type="d4p1:' +
          encodeXml(type) + '">' +
          encodeXml(formatXmlScalar(value, type)) +
          '</Value>'
        );
      }

      output.push('    </KeyValueOfstringanyType>');
    }

    output.push('  </ArrayOfKeyValueOfstringanyType>');
  });

  output.push('</ArrayOfArrayOfKeyValueOfstringanyType>');
  return output.join('\n');
}

async function sha256Lower(text) {
  if (!globalThis.crypto || !globalThis.crypto.subtle)
    throw new Error('Web Crypto non disponibile: impossibile aggiornare le impronte del progetto.');

  const bytes = new TextEncoder().encode(String(text == null ? '' : text));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map(value => value.toString(16).padStart(2, '0'))
    .join('');
}

function numberOrOriginal(value, original) {
  const numeric = Number(String(value == null ? '' : value).replace(',', '.'));
  return Number.isFinite(numeric) ? numeric : original;
}

function contentTypeForSection(name, existing = '') {
  if (existing) return existing;
  if (name === TERMODEL_BACKGROUND_INDEX_SECTION) return 'application/json';
  if (name.startsWith(TERMODEL_BACKGROUND_SECTION_PREFIX)) return 'text/plain';
  if (/\.json$/i.test(name)) return 'application/json';
  if (/\.xml$/i.test(name)) return 'application/xml';
  if (/\.svg$/i.test(name)) return 'image/svg+xml';
  if (/\.dxf$/i.test(name)) return 'application/dxf';
  return 'text/plain';
}

function syncBackgroundSections(source, backgrounds) {
  let result = normalizeSource(source);
  const parsed = parseTermodelProjectText(result);

  for (const name of parsed.sectionOrder) {
    if (name.startsWith(TERMODEL_BACKGROUND_SECTION_PREFIX))
      result = removeTermodelProjectSection(result, name);
  }

  if (!Array.isArray(backgrounds) || !backgrounds.length)
    return result;

  const index = {
    format: 'TERMODEL-BACKGROUNDS-V1',
    backgrounds: backgrounds.map(item => ({
      id: item.id,
      plane: item.plane || '',
      layer: item.layer || '',
      fileName: item.fileName || '',
      kind: item.kind || '',
      mimeType: item.mimeType || 'application/octet-stream',
      section: item.section
    }))
  };

  result = setTermodelProjectSection(
    result,
    TERMODEL_BACKGROUND_INDEX_SECTION,
    JSON.stringify(index, null, 2)
  );

  for (const item of backgrounds) {
    if (!item?.section || !/^data:/i.test(String(item.dataUrl || '')))
      continue;
    result = setTermodelProjectSection(result, item.section, item.dataUrl);
  }

  return result;
}

function updateManifestFloors(manifest, pianiRecords) {
  if (!Array.isArray(pianiRecords) || !pianiRecords.length) return;

  if (manifest.geometry && typeof manifest.geometry === 'object')
    manifest.geometry.floorCount = pianiRecords.length;

  const oldFloors = Array.isArray(manifest.floors) ? manifest.floors : [];
  manifest.floors = pianiRecords.map((piano, index) => {
    const old = oldFloors[index] && typeof oldFloors[index] === 'object'
      ? oldFloors[index]
      : {};

    return {
      ...old,
      order: index,
      id: old.id || ('F' + String(index + 1).padStart(3, '0')),
      name: piano.Nome == null ? (old.name || '') : String(piano.Nome),
      type: piano.Tipo == null ? (old.type || '') : String(piano.Tipo),
      fileName: piano.NomeFile == null ? (old.fileName || '') : String(piano.NomeFile),
      cadLayer: piano.LayerCad == null ? (old.cadLayer || '') : String(piano.LayerCad),
      netHeightMeters: numberOrOriginal(piano.AltezzaNetta, old.netHeightMeters),
      grossHeightMeters: numberOrOriginal(piano.AltezzaLorda, old.grossHeightMeters),
      repetitions: numberOrOriginal(piano.PianiUguali, old.repetitions)
    };
  });
}

async function refreshManifest(source, pianiRecords) {
  const parsed = parseTermodelProjectText(source);
  const rawManifest = parsed.sections.get('manifest.json');
  if (!rawManifest) return source;

  let manifest;
  try {
    manifest = JSON.parse(rawManifest);
  } catch (error) {
    throw new Error('manifest.json non valido: ' + error.message);
  }

  manifest.generatedAtUtc = new Date().toISOString();
  updateManifestFloors(manifest, pianiRecords);

  const oldEntries = new Map(
    (Array.isArray(manifest.sections) ? manifest.sections : [])
      .filter(entry => entry && typeof entry.name === 'string')
      .map(entry => [entry.name, entry])
  );

  const sectionNames = parsed.sectionOrder.filter(name => name !== 'manifest.json');
  manifest.sections = await Promise.all(sectionNames.map(async (name) => {
    const old = oldEntries.get(name) || {};
    const sectionText = parsed.sections.get(name) || '';
    return {
      ...old,
      name,
      contentType: contentTypeForSection(name, old.contentType || ''),
      sha256: await sha256Lower(sectionText)
    };
  }));

  return replaceTermodelProjectSection(source, 'manifest.json', JSON.stringify(manifest, null, 2));
}

export async function buildTermodelProjectText(source, options = {}) {
  let result = normalizeSource(source);
  parseTermodelProjectText(result);

  if (options.geometrySvg !== undefined)
    result = replaceTermodelProjectSection(result, 'geometry/project.svg', options.geometrySvg);

  const archives = options.archives || {};
  for (const [archiveName, records] of Object.entries(archives)) {
    const parsed = parseTermodelProjectText(result);
    const jsonName = 'archives/json/' + archiveName + '.json';
    const xmlName = 'archives/xml/' + archiveName + '.xml';
    const oldJson = parsed.sections.get(jsonName);
    const oldXml = parsed.sections.get(xmlName);

    if (oldJson !== undefined) {
      const jsonText = serializeArchiveJson(oldJson, records);
      result = replaceTermodelProjectSection(result, jsonName, jsonText);
    }

    if (oldXml !== undefined) {
      const xmlText = serializeArchiveXml(oldXml, records);
      result = replaceTermodelProjectSection(result, xmlName, xmlText);
    }
  }

  if (options.backgrounds !== undefined)
    result = syncBackgroundSections(result, options.backgrounds);

  result = await refreshManifest(result, archives.Piani);
  return result;
}
