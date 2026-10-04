// Termodel Web — analisi client del DXF usata soltanto dal dialog di importazione.
// La conversione DXF -> SVG non viene più eseguita nel browser:
// il frontend invia il DXF originale e le opzioni a POST /api/dxf/to-svg.

const UNIT_NAMES = new Map([
  [0, 'senza unità'],
  [1, 'pollici'],
  [2, 'piedi'],
  [4, 'mm'],
  [5, 'cm'],
  [6, 'm'],
  [10, 'yard']
]);

const TERMODEL_DXF_UNIT_TO_CM = Object.freeze({
  mm: 0.1,
  cm: 1,
  m: 100
});

export function dxfUnitFromInsUnits(insUnits) {
  if (Number(insUnits) === 4) return 'mm';
  if (Number(insUnits) === 5) return 'cm';
  if (Number(insUnits) === 6) return 'm';
  return 'cm';
}

export function dxfUnitScaleToCm(unit) {
  return TERMODEL_DXF_UNIT_TO_CM[unit] || 1;
}

function dxfPairs(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const rawCode = lines[i].replace(/^\uFEFF/, '').trim();
    if (!rawCode) continue;
    const code = Number(rawCode);
    if (!Number.isFinite(code)) continue;
    pairs.push({ code, value: String(lines[i + 1] ?? '').trimEnd() });
  }
  return pairs;
}

function findSection(pairs, name) {
  for (let i = 0; i < pairs.length - 1; i++) {
    if (pairs[i].code === 0 && pairs[i].value === 'SECTION' &&
        pairs[i + 1].code === 2 && pairs[i + 1].value === name) {
      const start = i + 2;
      for (let j = start; j < pairs.length; j++) {
        if (pairs[j].code === 0 && pairs[j].value === 'ENDSEC')
          return pairs.slice(start, j);
      }
    }
  }
  return [];
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function first(fields, code, fallback = '') {
  const pair = fields.find(item => item.code === code);
  return pair ? pair.value : fallback;
}

function all(fields, code) {
  return fields.filter(item => item.code === code).map(item => item.value);
}

function pointFrom(fields, xCode, yCode) {
  return {
    x: num(first(fields, xCode, 0)),
    y: num(first(fields, yCode, 0))
  };
}

function parseHeader(section) {
  const header = {};
  for (let i = 0; i < section.length; i++) {
    if (section[i].code !== 9) continue;
    const key = section[i].value;
    const values = [];
    for (i = i + 1; i < section.length && section[i].code !== 9; i++)
      values.push(section[i]);
    i--;
    header[key] = values;
  }
  const insUnitsPair = (header.$INSUNITS || []).find(pair => pair.code === 70);
  const insUnits = insUnitsPair ? num(insUnitsPair.value, 0) : 0;
  return {
    variables: header,
    insUnits,
    unitsLabel: UNIT_NAMES.get(insUnits) || ('codice ' + insUnits)
  };
}

function parseLayerTable(section) {
  const layers = new Set();
  for (let i = 0; i < section.length; i++) {
    if (section[i].code !== 0 || section[i].value !== 'LAYER') continue;
    const fields = [];
    for (i = i + 1; i < section.length && section[i].code !== 0; i++)
      fields.push(section[i]);
    i--;
    const name = String(first(fields, 2, '0')).trim() || '0';
    layers.add(name);
  }
  return layers;
}

function parsePolylineVertices(fields) {
  const vertices = [];
  let current = null;
  for (const pair of fields) {
    if (pair.code === 10) {
      current = { x: num(pair.value), y: 0, bulge: 0 };
      vertices.push(current);
    } else if (pair.code === 20 && current) {
      current.y = num(pair.value);
    } else if (pair.code === 42 && current) {
      current.bulge = num(pair.value);
    }
  }
  return vertices;
}

function parseSimpleEntity(type, fields) {
  const layer = String(first(fields, 8, '0')).trim() || '0';
  const common = { type, layer };

  if (type === 'LINE') {
    return {
      ...common,
      start: pointFrom(fields, 10, 20),
      end: pointFrom(fields, 11, 21)
    };
  }

  if (type === 'LWPOLYLINE') {
    return {
      ...common,
      vertices: parsePolylineVertices(fields),
      closed: (num(first(fields, 70, 0)) & 1) !== 0
    };
  }

  if (type === 'ARC') {
    return {
      ...common,
      center: pointFrom(fields, 10, 20),
      radius: Math.abs(num(first(fields, 40, 0))),
      startAngle: num(first(fields, 50, 0)),
      endAngle: num(first(fields, 51, 0))
    };
  }

  if (type === 'CIRCLE') {
    return {
      ...common,
      center: pointFrom(fields, 10, 20),
      radius: Math.abs(num(first(fields, 40, 0)))
    };
  }

  if (type === 'ELLIPSE') {
    return {
      ...common,
      center: pointFrom(fields, 10, 20),
      major: pointFrom(fields, 11, 21),
      ratio: Math.abs(num(first(fields, 40, 1), 1)),
      startParam: num(first(fields, 41, 0)),
      endParam: num(first(fields, 42, Math.PI * 2), Math.PI * 2)
    };
  }

  if (type === 'SPLINE') {
    const control = [];
    let p = null;
    for (const pair of fields) {
      if (pair.code === 10) {
        p = { x: num(pair.value), y: 0 };
        control.push(p);
      } else if (pair.code === 20 && p) {
        p.y = num(pair.value);
      }
    }
    return { ...common, controlPoints: control };
  }

  if (type === 'TEXT') {
    return {
      ...common,
      point: pointFrom(fields, 10, 20),
      height: Math.abs(num(first(fields, 40, 2.5), 2.5)),
      rotation: num(first(fields, 50, 0)),
      text: String(first(fields, 1, ''))
    };
  }

  if (type === 'MTEXT') {
    const chunks = [...all(fields, 3), ...all(fields, 1)];
    return {
      ...common,
      point: pointFrom(fields, 10, 20),
      height: Math.abs(num(first(fields, 40, 2.5), 2.5)),
      rotation: num(first(fields, 50, 0)),
      text: chunks.join('')
    };
  }

  if (type === 'INSERT') {
    return {
      ...common,
      block: String(first(fields, 2, '')).trim(),
      point: pointFrom(fields, 10, 20),
      scaleX: num(first(fields, 41, 1), 1),
      scaleY: num(first(fields, 42, 1), 1),
      rotation: num(first(fields, 50, 0))
    };
  }

  return { ...common, raw: fields };
}

function parseEntityAt(section, startIndex) {
  const type = section[startIndex]?.value || '';
  if (section[startIndex]?.code !== 0)
    return { entity: null, nextIndex: startIndex + 1 };

  const headerFields = [];
  let i = startIndex + 1;
  while (i < section.length && section[i].code !== 0) {
    headerFields.push(section[i]);
    i++;
  }

  if (type !== 'POLYLINE') {
    return {
      entity: parseSimpleEntity(type, headerFields),
      nextIndex: i
    };
  }

  const layer = String(first(headerFields, 8, '0')).trim() || '0';
  const entity = {
    type: 'POLYLINE',
    layer,
    closed: (num(first(headerFields, 70, 0)) & 1) !== 0,
    vertices: []
  };

  while (i < section.length) {
    if (section[i].code !== 0) {
      i++;
      continue;
    }
    const childType = section[i].value;
    if (childType === 'SEQEND') {
      i++;
      break;
    }
    if (childType !== 'VERTEX')
      break;

    const vertexFields = [];
    i++;
    while (i < section.length && section[i].code !== 0) {
      vertexFields.push(section[i]);
      i++;
    }
    entity.vertices.push({
      x: num(first(vertexFields, 10, 0)),
      y: num(first(vertexFields, 20, 0)),
      bulge: num(first(vertexFields, 42, 0))
    });
  }

  return { entity, nextIndex: i };
}

function parseEntities(section) {
  const entities = [];
  let i = 0;
  while (i < section.length) {
    if (section[i].code !== 0) {
      i++;
      continue;
    }
    const parsed = parseEntityAt(section, i);
    if (parsed.entity && parsed.entity.type && !['ENDSEC', 'SEQEND'].includes(parsed.entity.type))
      entities.push(parsed.entity);
    i = Math.max(parsed.nextIndex, i + 1);
  }
  return entities;
}

function parseBlocks(section) {
  const blocks = new Map();
  let i = 0;

  while (i < section.length) {
    if (section[i].code !== 0 || section[i].value !== 'BLOCK') {
      i++;
      continue;
    }

    const header = [];
    i++;
    while (i < section.length && section[i].code !== 0) {
      header.push(section[i]);
      i++;
    }

    const name = String(first(header, 2, first(header, 3, ''))).trim();
    const base = pointFrom(header, 10, 20);
    const entities = [];

    while (i < section.length) {
      if (section[i].code === 0 && section[i].value === 'ENDBLK') {
        i++;
        break;
      }
      if (section[i].code !== 0) {
        i++;
        continue;
      }
      const parsed = parseEntityAt(section, i);
      if (parsed.entity) entities.push(parsed.entity);
      i = Math.max(parsed.nextIndex, i + 1);
    }

    if (name)
      blocks.set(name, { name, base, entities });
  }

  return blocks;
}

function collectLayers(model) {
  const counts = new Map();
  const add = layer => {
    const key = String(layer || '0').trim() || '0';
    counts.set(key, (counts.get(key) || 0) + 1);
  };

  model.tableLayers.forEach(layer => {
    if (!counts.has(layer)) counts.set(layer, 0);
  });
  model.entities.forEach(entity => add(entity.layer));
  model.blocks.forEach(block => block.entities.forEach(entity => add(entity.layer)));

  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export function parseDxfPlotSource(text) {
  const pairs = dxfPairs(text);
  if (!pairs.length)
    throw new Error('Il file DXF non contiene coppie group-code leggibili.');

  const header = parseHeader(findSection(pairs, 'HEADER'));
  const tableLayers = parseLayerTable(findSection(pairs, 'TABLES'));
  const blocks = parseBlocks(findSection(pairs, 'BLOCKS'));
  const entities = parseEntities(findSection(pairs, 'ENTITIES'));

  if (!entities.length && !blocks.size)
    throw new Error('Il DXF non contiene entità 2D convertibili.');

  const model = { header, tableLayers, blocks, entities };
  model.layers = collectLayers(model);
  return model;
}

export function getDxfLayerSummary(model) {
  return Array.isArray(model?.layers) ? model.layers.map(item => ({ ...item })) : [];
}

function normalizeOptions(model, options = {}) {
  const available = getDxfLayerSummary(model).map(item => item.name);
  const layers = options.layers instanceof Set
    ? options.layers
    : new Set(Array.isArray(options.layers) ? options.layers : available);
  const unit = ['m', 'cm', 'mm'].includes(options.unit)
    ? options.unit
    : dxfUnitFromInsUnits(model?.header?.insUnits);
  return {
    layers,
    curves: Boolean(options.curves),
    convertText: Boolean(options.convertText),
    explodeBlocks: Boolean(options.explodeBlocks),
    unit,
    unitScaleToCm: dxfUnitScaleToCm(unit)
  };
}

function entityAllowedByMode(entity, options) {
  if (['LINE', 'LWPOLYLINE', 'POLYLINE'].includes(entity.type)) return true;
  if (options.curves && ['ARC', 'CIRCLE', 'ELLIPSE', 'SPLINE'].includes(entity.type)) return true;
  if (options.convertText && ['TEXT', 'MTEXT'].includes(entity.type)) return true;
  if (entity.type === 'INSERT') return options.explodeBlocks;
  return false;
}

export function estimateDxfConversion(model, options = {}) {
  const normalized = normalizeOptions(model, options);
  let selected = 0;
  let ignored = 0;
  let blocks = 0;

  const visit = (entities, inheritedLayer = '', depth = 0) => {
    if (depth > 8) return;
    for (const entity of entities || []) {
      const layer = entity.layer === '0' && inheritedLayer ? inheritedLayer : entity.layer;
      if (!normalized.layers.has(layer)) {
        ignored++;
        continue;
      }
      if (entity.type === 'INSERT' && normalized.explodeBlocks) {
        const block = model.blocks.get(entity.block);
        if (!block) {
          ignored++;
          continue;
        }
        blocks++;
        visit(block.entities, layer, depth + 1);
        continue;
      }
      if (entityAllowedByMode(entity, normalized)) selected++;
      else ignored++;
    }
  };

  visit(model.entities);
  return { selected, ignored, blocks };
}
