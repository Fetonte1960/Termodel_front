// GeneraPianta Web Lite v0.6
// Input: SVG Termodel già interpretato da GPT.
// Topologia: JSTS (port JavaScript di JTS, famiglia di NetTopologySuite).
// Scopo pubblico concordato: sola geometria 2D necessaria a pianta pulita,
// pavimenti/soffitti e semplice estrusione. Nessuna logica termica/archivi/DXF.
//
// Convenzioni di questa versione:
// - E... = filo interno parete esterna, spessore totale 40 cm verso l'esterno.
// - W... = asse divisorio interno, spessore totale 15 cm (7.5 cm per lato).

const EXTERNAL_WALL_THICKNESS_CM = 40;
const INTERNAL_WALL_THICKNESS_CM = 15;
const INTERNAL_HALF_THICKNESS_CM = INTERNAL_WALL_THICKNESS_CM / 2;
const EDGE_MATCH_TOLERANCE = 0.20;
const MITER_LIMIT_FACTOR = 10;

function getJsts() {
  const api = globalThis.jsts;
  if (!api)
    throw new Error('JSTS non disponibile: impossibile costruire la pianta.');
  return api;
}

function collectionToArray(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection.filter(Boolean);
  if (Array.isArray(collection.array)) return collection.array.filter(Boolean);
  if (typeof collection.toArray === 'function')
    return Array.from(collection.toArray()).filter(Boolean);

  if (typeof collection.iterator === 'function') {
    const result = [];
    const iterator = collection.iterator();
    while (iterator.hasNext()) result.push(iterator.next());
    return result.filter(Boolean);
  }

  return [];
}

function numberAttr(element, name) {
  const value = Number.parseFloat(element.getAttribute(name) || '');
  if (!Number.isFinite(value))
    throw new Error(`Coordinata SVG non valida: ${name}.`);
  return value;
}

function wallClassFromId(id) {
  if (/^E/i.test(id || '')) return 'external';
  if (/^W/i.test(id || '')) return 'internal';
  return 'other';
}

function readLinee(calpestabile) {
  return Array.from(calpestabile.children)
    // GeneraPianta ricostruisce soltanto l'edificio: le linee tecniche di
    // rete (Tubo, layer *_tubipannelli) restano nel file unico ma non devono
    // partecipare a noding/polygonizzazione dei locali.
    .filter(el => el.localName === 'line' && /^[EW]/i.test(el.id || ''))
    .map((el, index) => {
      const id = el.id || `L${String(index + 1).padStart(3, '0')}`;
      const wallClass = wallClassFromId(id);
      return {
        id,
        x1: numberAttr(el, 'x1'),
        y1: numberAttr(el, 'y1'),
        x2: numberAttr(el, 'x2'),
        y2: numberAttr(el, 'y2'),
        wallClass,
        thicknessCm:
          wallClass === 'external' ? EXTERNAL_WALL_THICKNESS_CM :
          wallClass === 'internal' ? INTERNAL_WALL_THICKNESS_CM : null
      };
    });
}

function readLocali(calpestabile) {
  return Array.from(calpestabile.children)
    .filter(el => el.localName === 'text' && /^R\d+/i.test(el.id || ''))
    .map((el, index) => {
      const righe = Array.from(el.querySelectorAll('tspan'))
        .map(t => (t.textContent || '').trim())
        .filter(Boolean);
      const descrizione = righe
        .find(r => r.toUpperCase().startsWith('DESCR.,'))
        ?.slice('DESCR.,'.length)
        .trim();

      return {
        id: el.id || `R${String(index + 1).padStart(3, '0')}`,
        x: numberAttr(el, 'x'),
        y: numberAttr(el, 'y'),
        descrizione: descrizione || el.id || `Locale ${index + 1}`
      };
    });
}

function symbolRows(element) {
  const values = {};
  Array.from(element?.querySelectorAll?.('tspan') || []).forEach((tspan) => {
    const line = String(tspan.textContent || '').trim();
    const comma = line.indexOf(',');
    if (comma < 0) return;
    const key = line.slice(0, comma).trim().toUpperCase();
    const value = line.slice(comma + 1).trim();
    if (key) values[key] = value;
  });
  return values;
}

function numberSymbolValue(rows, key) {
  const value = Number.parseFloat(String(rows?.[key] ?? '').replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

function readFinestre(calpestabile) {
  return Array.from(calpestabile.children)
    .filter((el) => {
      if (el.localName !== 'text') return false;
      const rows = symbolRows(el);
      return String(rows.BLOCCO || '').trim().toUpperCase() === 'FIN';
    })
    .map((el, index) => {
      const rows = symbolRows(el);
      return {
        id: el.id || `F${String(index + 1).padStart(3, '0')}`,
        x: numberAttr(el, 'x'),
        y: numberAttr(el, 'y'),
        porta: rows.PORTA || '',
        tipo: rows.TIPO || '',
        larghezzaCm: numberSymbolValue(rows, 'LARGHEZZA'),
        altezzaCm: numberSymbolValue(rows, 'ALTEZZA'),
        sottofinestraCm: numberSymbolValue(rows, 'SOTTOFINESTRA'),
        sopraluceCm: numberSymbolValue(rows, 'SOPRALUCE'),
        numeroAnte: rows.NUMEROANTE || ''
      };
    });
}

function polygonContainsPoint(jsts, polygon, point) {
  if (typeof polygon.contains === 'function')
    return polygon.contains(point);

  const RelateOp = jsts.operation?.relate?.RelateOp;
  if (RelateOp && typeof RelateOp.contains === 'function')
    return RelateOp.contains(polygon, point);

  throw new Error('JSTS non espone l’operazione contains richiesta da GeneraPianta.');
}

function ringCoordinates(ring) {
  const coords = Array.from(ring.getCoordinates() || [])
    .map(c => [Number(c.x), Number(c.y)])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));

  if (coords.length > 1) {
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (Math.abs(first[0] - last[0]) < 1e-9 &&
        Math.abs(first[1] - last[1]) < 1e-9)
      coords.pop();
  }

  return coords;
}

function polygonToPlain(polygon) {
  const holes = [];
  for (let i = 0; i < polygon.getNumInteriorRing(); i++)
    holes.push(ringCoordinates(polygon.getInteriorRingN(i)));

  return {
    shell: ringCoordinates(polygon.getExteriorRing()),
    holes,
    area: Math.abs(Number(polygon.getArea?.() || 0))
  };
}

function matchLocaliToPolygons(jsts, geometryFactory, locali, polygons) {
  const matchedIndexes = new Set();
  const result = [];

  locali.forEach((locale) => {
    const point = geometryFactory.createPoint(
      new jsts.geom.Coordinate(locale.x, locale.y)
    );

    const candidates = polygons
      .map((polygon, index) => ({ polygon, index, area: Math.abs(polygon.getArea()) }))
      .filter(candidate => polygonContainsPoint(jsts, candidate.polygon, point))
      .sort((a, b) => a.area - b.area);

    if (!candidates.length)
      throw new Error(`JSTS non trova un poligono per il locale ${locale.id}.`);

    const selected = candidates.find(candidate => !matchedIndexes.has(candidate.index)) || candidates[0];
    matchedIndexes.add(selected.index);

    result.push({
      ...locale,
      ...polygonToPlain(selected.polygon),
      _polygon: selected.polygon
    });
  });

  // Se lo SVG non contiene LOC, restituiamo comunque i poligoni costruiti.
  if (!locali.length) {
    polygons.forEach((polygon, index) => {
      const plain = polygonToPlain(polygon);
      result.push({
        id: `R-AI-${String(index + 1).padStart(3, '0')}`,
        descrizione: `Locale ${index + 1}`,
        x: plain.shell[0]?.[0] ?? 0,
        y: plain.shell[0]?.[1] ?? 0,
        ...plain,
        _polygon: polygon
      });
    });
  }

  return result;
}

function largestPolygon(geometry) {
  if (!geometry) return null;
  if (typeof geometry.isEmpty === 'function' && geometry.isEmpty()) return null;

  if (geometry.getGeometryType?.() === 'Polygon')
    return geometry;

  let best = null;
  const count = Number(geometry.getNumGeometries?.() || 0);
  for (let i = 0; i < count; i++) {
    const candidate = geometry.getGeometryN(i);
    if (candidate?.getGeometryType?.() !== 'Polygon') continue;
    if (!best || Math.abs(candidate.getArea()) > Math.abs(best.getArea()))
      best = candidate;
  }
  return best;
}

function perimetroEsterno(jsts, geometryFactory, polygons) {
  if (!polygons.length) return null;

  // Equivalente del nucleo usato da GeneraPianta C#:
  // union robusta, eventuale MultiPolygon -> corpo di area maggiore,
  // poi soltanto ExteriorRing.
  const collection = geometryFactory.createGeometryCollection(polygons);
  const united = jsts.operation.union.UnaryUnionOp.union(collection);
  const best = largestPolygon(united);
  if (!best) return null;

  const coords = Array.from(best.getExteriorRing().getCoordinates() || []);
  if (coords.length < 4) return null;
  return geometryFactory.createPolygon(geometryFactory.createLinearRing(coords));
}

function segmentLength(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function nearestPointOnSegment(point, a, b) {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const wx = point[0] - a[0];
  const wy = point[1] - a[1];
  const len2 = vx * vx + vy * vy;
  if (len2 <= 1e-12) return a.slice();
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
  return [a[0] + t * vx, a[1] + t * vy];
}

function distancePointToSegment(point, a, b) {
  const projected = nearestPointOnSegment(point, a, b);
  return Math.hypot(point[0] - projected[0], point[1] - projected[1]);
}

function nearestWallForPoint(point, linee) {
  const candidates = (linee || [])
    .filter(line => line.wallClass === 'external' || line.wallClass === 'internal')
    .map((line) => {
      const a = [line.x1, line.y1];
      const b = [line.x2, line.y2];
      const projected = nearestPointOnSegment(point, a, b);
      return {
        line,
        point: projected,
        distance: Math.hypot(point[0] - projected[0], point[1] - projected[1])
      };
    })
    .sort((a, b) => a.distance - b.distance);

  return candidates[0] || null;
}

function sourceLineForEdge(start, end, linee) {
  const ex = end[0] - start[0];
  const ey = end[1] - start[1];
  const edgeLen = Math.hypot(ex, ey);
  if (edgeLen <= 1e-9) return null;

  const midpoint = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
  const candidates = [];

  linee.forEach((line) => {
    const a = [line.x1, line.y1];
    const b = [line.x2, line.y2];
    const lx = b[0] - a[0];
    const ly = b[1] - a[1];
    const lineLen = Math.hypot(lx, ly);
    if (lineLen <= 1e-9) return;

    const normalizedCross = Math.abs(ex * ly - ey * lx) / (edgeLen * lineLen);
    if (normalizedCross > 1e-5) return;

    const distance = distancePointToSegment(midpoint, a, b);
    if (distance <= EDGE_MATCH_TOLERANCE)
      candidates.push({ line, distance });
  });

  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0]?.line || null;
}

function outwardNormal(jsts, geometryFactory, polygon, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  if (length <= 1e-9) return null;

  // Stesso normale destro del C#: (dy, -dx), poi corretto
  // geometricamente per non dipendere dall'orientamento dell'anello.
  let nx = dy / length;
  let ny = -dx / length;

  const mx = (start[0] + end[0]) / 2;
  const my = (start[1] + end[1]) / 2;
  const probeDistance = Math.max(0.05, Math.min(length * 0.001, 0.50));
  const probe = geometryFactory.createPoint(
    new jsts.geom.Coordinate(mx + nx * probeDistance, my + ny * probeDistance)
  );

  if (polygonContainsPoint(jsts, polygon, probe)) {
    nx = -nx;
    ny = -ny;
  }

  return [nx, ny];
}

function inwardNormal(jsts, geometryFactory, polygon, start, end) {
  const out = outwardNormal(jsts, geometryFactory, polygon, start, end);
  return out ? [-out[0], -out[1]] : null;
}

function infiniteLineIntersection(a1, a2, b1, b2) {
  const x1 = a1[0], y1 = a1[1];
  const x2 = a2[0], y2 = a2[1];
  const x3 = b1[0], y3 = b1[1];
  const x4 = b2[0], y4 = b2[1];

  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-9) return null;

  const det1 = x1 * y2 - y1 * x2;
  const det2 = x3 * y4 - y3 * x4;
  return [
    (det1 * (x3 - x4) - (x1 - x2) * det2) / denom,
    (det1 * (y3 - y4) - (y1 - y2) * det2) / denom
  ];
}

function edgeOnExterior(start, end, exteriorRing) {
  const ex = end[0] - start[0];
  const ey = end[1] - start[1];
  const edgeLen = Math.hypot(ex, ey);
  if (edgeLen <= 1e-9) return false;

  const midpoint = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];

  for (let i = 0; i < exteriorRing.length; i++) {
    const a = exteriorRing[i];
    const b = exteriorRing[(i + 1) % exteriorRing.length];
    const bx = b[0] - a[0];
    const by = b[1] - a[1];
    const boundaryLen = Math.hypot(bx, by);
    if (boundaryLen <= 1e-9) continue;

    const normalizedCross = Math.abs(ex * by - ey * bx) / (edgeLen * boundaryLen);
    if (normalizedCross > 1e-5) continue;

    if (distancePointToSegment(midpoint, a, b) <= EDGE_MATCH_TOLERANCE)
      return true;
  }

  return false;
}

function joinShiftedEdges(shifted, warnings, contextId) {
  if (shifted.length < 3)
    throw new Error(`${contextId}: impossibile costruire il parallelo.`);

  const joined = [];
  for (let i = 0; i < shifted.length; i++) {
    const current = shifted[i];
    const next = shifted[(i + 1) % shifted.length];

    let intersection = infiniteLineIntersection(
      current.start, current.end,
      next.start, next.end
    );

    const maxExpected =
      Math.max(current.distance, next.distance, 0.01) * MITER_LIMIT_FACTOR;

    if (intersection) {
      const miterLength = Math.hypot(
        intersection[0] - current.originalJoin[0],
        intersection[1] - current.originalJoin[1]
      );

      if (!Number.isFinite(miterLength) || miterLength > maxExpected) {
        warnings.push(
          `${contextId}: raccordo quasi parallelo limitato al vertice ${i + 1}.`
        );
        intersection = null;
      }
    }

    if (!intersection) {
      intersection = [
        (current.end[0] + next.start[0]) / 2,
        (current.end[1] + next.start[1]) / 2
      ];
    }

    joined.push(intersection);
  }

  return joined;
}

function offsetPerimetroEsterno(
  jsts, geometryFactory, buildingPolygon, warnings
) {
  const coords = ringCoordinates(buildingPolygon.getExteriorRing());
  const shifted = [];

  for (let i = 0; i < coords.length; i++) {
    const start = coords[i];
    const end = coords[(i + 1) % coords.length];
    if (segmentLength(start, end) <= 1e-9) continue;

    const normal = outwardNormal(
      jsts, geometryFactory, buildingPolygon, start, end
    );
    if (!normal) continue;

    const [nx, ny] = normal;
    shifted.push({
      start: [
        start[0] + nx * EXTERNAL_WALL_THICKNESS_CM,
        start[1] + ny * EXTERNAL_WALL_THICKNESS_CM
      ],
      end: [
        end[0] + nx * EXTERNAL_WALL_THICKNESS_CM,
        end[1] + ny * EXTERNAL_WALL_THICKNESS_CM
      ],
      distance: EXTERNAL_WALL_THICKNESS_CM,
      originalJoin: end
    });
  }

  return joinShiftedEdges(shifted, warnings, 'Perimetro esterno edificio');
}

function offsetLocaleNetto(
  jsts,
  geometryFactory,
  localePolygon,
  exteriorRing,
  linee,
  warnings,
  contextId
) {
  const coords = ringCoordinates(localePolygon.getExteriorRing());
  const shifted = [];
  const edgeRoles = [];

  for (let i = 0; i < coords.length; i++) {
    const start = coords[i];
    const end = coords[(i + 1) % coords.length];
    if (segmentLength(start, end) <= 1e-9) continue;

    const geometricRole = edgeOnExterior(start, end, exteriorRing)
      ? 'external'
      : 'internal';

    const source = sourceLineForEdge(start, end, linee);
    const sourceRole = source?.wallClass || 'unknown';

    if (source && sourceRole !== 'other' && sourceRole !== geometricRole) {
      warnings.push(
        `${contextId}: ${source.id} classificata GPT ${sourceRole === 'external' ? 'E' : 'W'} ma geometricamente ${geometricRole === 'external' ? 'esterna' : 'interna'}.`
      );
    }

    let distance = 0;
    let normal = [0, 0];

    // Regola GeneraPianta concordata:
    // - lato esterno: è già il filo interno della parete esterna -> NON si sposta
    // - lato interno: asse divisorio -> 1/2 spessore verso l'interno del locale
    if (geometricRole === 'internal') {
      distance = INTERNAL_HALF_THICKNESS_CM;
      normal = inwardNormal(
        jsts, geometryFactory, localePolygon, start, end
      ) || [0, 0];
    }

    const [nx, ny] = normal;
    shifted.push({
      start: [start[0] + nx * distance, start[1] + ny * distance],
      end: [end[0] + nx * distance, end[1] + ny * distance],
      distance,
      originalJoin: end
    });

    edgeRoles.push({
      index: i,
      geometricRole,
      sourceId: source?.id || '',
      sourceRole
    });
  }

  return {
    ring: joinShiftedEdges(shifted, warnings, contextId),
    edgeRoles
  };
}

function bboxFromRings(rings) {
  const xs = [];
  const ys = [];
  rings.filter(Boolean).forEach(ring => ring.forEach(([x, y]) => {
    if (Number.isFinite(x) && Number.isFinite(y)) {
      xs.push(x);
      ys.push(y);
    }
  }));

  if (!xs.length || !ys.length)
    return { x: 0, y: 0, width: 100, height: 100 };

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const pad = Math.max((maxX - minX) * 0.025, (maxY - minY) * 0.025, 10);

  return {
    x: minX - pad,
    y: minY - pad,
    width: (maxX - minX) + pad * 2,
    height: (maxY - minY) + pad * 2
  };
}

function pathFromRing(ring) {
  if (!ring?.length) return '';
  return `M ${ring.map(([x, y]) => `${x} ${y}`).join(' L ')} Z`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function generaSvgPulito(locali, edificio) {
  const rings = [
    edificio.outerShell,
    ...locali.map(locale => locale.architecturalShell)
  ];
  const box = bboxFromRings(rings);

  // La massa muraria nasce esattamente dai perimetri concordati:
  // contorno esterno parallelizzato verso fuori di 40 cm
  // meno i perimetri netti dei singoli locali.
  const wallMassPath = [
    pathFromRing(edificio.outerShell),
    ...locali.map(locale => pathFromRing(locale.architecturalShell))
  ].filter(Boolean).join(' ');

  const roomPaths = locali.map(locale =>
    `    <path id="${escapeXml(locale.id)}" d="${pathFromRing(locale.architecturalShell)}" fill="#fafafa" stroke="none" />`
  ).join('\n');

  const cleanContours = locali.map(locale =>
    `    <path id="${escapeXml(locale.id)}-NETTO" d="${pathFromRing(locale.architecturalShell)}" fill="none" stroke="#777" stroke-width="1.4" vector-effect="non-scaling-stroke" />`
  ).join('\n');

  const labels = locali.map(locale =>
    `    <text x="${locale.x}" y="${locale.y}" text-anchor="middle" font-family="Arial, sans-serif" font-size="16">${escapeXml(locale.id)} — ${escapeXml(locale.descrizione)}</text>`
  ).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.x} ${box.y} ${box.width} ${box.height}">
  <rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="white" />
  <g id="pareti-architettoniche">
    <path id="MASSA-MURARIA" d="${wallMassPath}" fill="#cfcfcf" fill-rule="evenodd" stroke="#777" stroke-width="1.2" vector-effect="non-scaling-stroke" />
  </g>
  <g id="locali-puliti">
${roomPaths}
  </g>
  <g id="contorni-architettonici">
${cleanContours}
  </g>
  <g id="etichette-locali" fill="#555">
${labels}
  </g>
</svg>`;
}

export function generaPiantaDaSvg(svgText) {
  const jsts = getJsts();
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError)
    throw new Error('Lo SVG ricevuto non è XML leggibile.');

  const root = doc.documentElement;
  const calpestabile = Array.from(root.children)
    .find(el => el.localName === 'g' && el.id === 'calpestabile');

  if (!calpestabile)
    throw new Error('Manca il gruppo calpestabile richiesto da GeneraPianta Web.');

  const linee = readLinee(calpestabile);
  if (!linee.length)
    throw new Error('Nessuna parete disponibile per GeneraPianta Web.');

  const localiInput = readLocali(calpestabile);
  const finestreInput = readFinestre(calpestabile);
  const geometryFactory = new jsts.geom.GeometryFactory();

  const lineStrings = linee.map(line =>
    geometryFactory.createLineString([
      new jsts.geom.Coordinate(line.x1, line.y1),
      new jsts.geom.Coordinate(line.x2, line.y2)
    ])
  );

  const multiLine = geometryFactory.createMultiLineString(lineStrings);
  const noded = jsts.operation.union.UnaryUnionOp.union(multiLine);

  const polygonizer = new jsts.operation.polygonize.Polygonizer();
  polygonizer.add(noded);

  const polygons = collectionToArray(polygonizer.getPolygons());
  if (!polygons.length)
    throw new Error('JSTS Polygonizer non ha prodotto alcun locale.');

  const matchedLocali = matchLocaliToPolygons(
    jsts, geometryFactory, localiInput, polygons
  );

  const buildingPolygon = perimetroEsterno(
    jsts, geometryFactory, polygons
  );
  if (!buildingPolygon)
    throw new Error('GeneraPianta Web non ha ricostruito il perimetro esterno.');

  const warnings = [];
  const innerShell = ringCoordinates(buildingPolygon.getExteriorRing());
  const outerShell = offsetPerimetroEsterno(
    jsts, geometryFactory, buildingPolygon, warnings
  );

  const locali = matchedLocali.map((locale) => {
    const netto = offsetLocaleNetto(
      jsts,
      geometryFactory,
      locale._polygon,
      innerShell,
      linee,
      warnings,
      locale.id
    );

    const { _polygon, ...plain } = locale;
    return {
      ...plain,
      architecturalShell: netto.ring,
      edgeRoles: netto.edgeRoles
    };
  });

  const edificio = {
    innerShell,
    outerShell,
    externalWallThicknessCm: EXTERNAL_WALL_THICKNESS_CM
  };

  const finestre = finestreInput.map((finestra) => {
    const match = nearestWallForPoint([finestra.x, finestra.y], linee);
    if (!match) {
      return {
        ...finestra,
        wallLineId: '',
        wallClass: '',
        wallThicknessCm: null,
        wallDirection: null,
        wallNormal: null
      };
    }

    const line = match.line;
    const dx = line.x2 - line.x1;
    const dy = line.y2 - line.y1;
    const length = Math.hypot(dx, dy);
    const direction = length > 1e-9 ? [dx / length, dy / length] : [1, 0];

    let normal;
    if (line.wallClass === 'external') {
      normal = outwardNormal(
        jsts,
        geometryFactory,
        buildingPolygon,
        [line.x1, line.y1],
        [line.x2, line.y2]
      );
    }
    if (!normal) normal = [-direction[1], direction[0]];

    return {
      ...finestra,
      x: match.point[0],
      y: match.point[1],
      wallLineId: line.id,
      wallClass: line.wallClass,
      wallThicknessCm: line.thicknessCm,
      wallDirection: direction,
      wallNormal: normal,
      wallDistanceCm: match.distance
    };
  });

  const warningUnici = [...new Set(warnings)];
  const edgeRoles = locali.flatMap(locale => locale.edgeRoles || []);
  const geometricExternalEdges = edgeRoles.filter(e => e.geometricRole === 'external').length;
  const geometricInternalEdges = edgeRoles.filter(e => e.geometricRole === 'internal').length;
  const classificationMismatches = edgeRoles.filter(e =>
    e.sourceRole !== 'unknown' &&
    e.sourceRole !== 'other' &&
    e.sourceRole !== e.geometricRole
  ).length;

  const svgPulito = generaSvgPulito(locali, edificio);

  return {
    linee,
    locali,
    finestre,
    edificio,
    svgPulito,
    defaults: {
      externalWallThicknessCm: EXTERNAL_WALL_THICKNESS_CM,
      internalWallThicknessCm: INTERNAL_WALL_THICKNESS_CM
    },
    warnings: warningUnici,
    stats: {
      linee: linee.length,
      loc: localiInput.length,
      finestre: finestre.length,
      poligoniJsts: polygons.length,
      locali: locali.length,
      geometricExternalEdges,
      geometricInternalEdges,
      classificationMismatches
    }
  };
}
