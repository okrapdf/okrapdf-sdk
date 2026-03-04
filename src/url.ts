import type { DeliveryTransform, DocUrlOptions, UrlBuilderOptions } from './types';

const DEFAULT_BASE_URL = 'https://api.okrapdf.com';

// ── Delivery transform key ordering (matches @okrapdf/schemas DELIVERY_KEYS) ──

const DELIVERY_KEY_ORDER = [
  'w', 'h', 'dpr', 'q', 'f', 'md', 'c', 'g', 'zm',
  'bl', 'sh', 'br', 'co', 'sa', 'r', 'fl', 'bg', 'anim', 'seg',
] as const;

const VALID_FORMATS = new Set(['auto', 'webp', 'avif', 'jpeg', 'png']);
const VALID_CROPS = new Set(['scale-down', 'contain', 'cover', 'crop', 'pad', 'squeeze']);
const VALID_GRAVITIES = new Set(['auto', 'face', 'left', 'right', 'top', 'bottom', 'center']);
const VALID_FLIPS = new Set(['h', 'v', 'hv']);
const VALID_ROTATIONS = new Set([0, 90, 180, 270]);

function validateTransform(t: DeliveryTransform): void {
  if (t.w !== undefined && (!Number.isInteger(t.w) || t.w <= 0)) throw new Error('Invalid delivery transform: w must be a positive integer');
  if (t.h !== undefined && (!Number.isInteger(t.h) || t.h <= 0)) throw new Error('Invalid delivery transform: h must be a positive integer');
  if (t.dpr !== undefined && t.dpr <= 0) throw new Error('Invalid delivery transform: dpr must be positive');
  if (t.q !== undefined && (!Number.isInteger(t.q) || t.q < 1 || t.q > 100)) throw new Error('Invalid delivery transform: q must be 1-100');
  if (t.f !== undefined && !VALID_FORMATS.has(t.f)) throw new Error(`Invalid delivery transform: f must be one of ${[...VALID_FORMATS].join(', ')}`);
  if (t.c !== undefined && !VALID_CROPS.has(t.c)) throw new Error(`Invalid delivery transform: c must be one of ${[...VALID_CROPS].join(', ')}`);
  if (t.g !== undefined && !VALID_GRAVITIES.has(t.g)) throw new Error(`Invalid delivery transform: g must be one of ${[...VALID_GRAVITIES].join(', ')}`);
  if (t.zm !== undefined && (t.zm < 0 || t.zm > 1)) throw new Error('Invalid delivery transform: zm must be 0-1');
  if (t.bl !== undefined && (!Number.isInteger(t.bl) || t.bl < 1 || t.bl > 250)) throw new Error('Invalid delivery transform: bl must be 1-250');
  if (t.sh !== undefined && (t.sh < 0 || t.sh > 10)) throw new Error('Invalid delivery transform: sh must be 0-10');
  if (t.r !== undefined && !VALID_ROTATIONS.has(t.r)) throw new Error('Invalid delivery transform: r must be 0, 90, 180, or 270');
  if (t.fl !== undefined && !VALID_FLIPS.has(t.fl)) throw new Error(`Invalid delivery transform: fl must be one of ${[...VALID_FLIPS].join(', ')}`);
}

/** Serialize delivery transform to a single URL segment: "w_200,h_300,q_80" */
function serializeTransform(t: DeliveryTransform): string {
  const tokens: string[] = [];
  const rec = t as Record<string, unknown>;
  for (const k of DELIVERY_KEY_ORDER) {
    if (rec[k] !== undefined) tokens.push(`${k}_${rec[k]}`);
  }
  return tokens.join(',');
}

// ── Modifier segment builder (inlined from @okrapdf/schemas/document-url) ──

interface Modifiers {
  variant?: string;
  default?: string;
  output?: string;
  transform?: DeliveryTransform;
}

function buildModifierSegments(mods: Modifiers): string[] {
  const parts: string[] = [];
  if (mods.variant) parts.push(`t_${mods.variant}`);
  if (mods.default) parts.push(`d_${mods.default}`);
  if (mods.output) parts.push(`o_${mods.output}`);
  if (mods.transform) {
    const seg = serializeTransform(mods.transform);
    if (seg) parts.push(seg);
  }
  return parts;
}

// ── Interfaces ──────────────────────────────────────────────────────────────

interface PgPage {
  png: (opts?: { placeholder?: string; transform?: DeliveryTransform }) => string;
  md: (opts?: { transform?: DeliveryTransform }) => string;
  json: (opts?: { transform?: DeliveryTransform }) => string;
}

interface PgPageRange {
  md: (opts?: { transform?: DeliveryTransform }) => string;
  json: (opts?: { transform?: DeliveryTransform }) => string;
}

interface PgProxy {
  [index: number]: PgPage;
  range: (start: number, end: number) => PgPageRange;
  list: (...pages: number[]) => PgPageRange;
}

interface DocumentUrl {
  /** Base document URL */
  url: (opts?: UrlBuilderOptions) => string;
  /** Thumbnail image URL (pg_1.png) */
  thumbnail: { url: (opts?: { transform?: DeliveryTransform }) => string };
  /** Full document markdown */
  full: { md: () => string };
  /** Original PDF download (auth required) */
  download: () => string;
  /** Page access: d.pg[1].png(), d.pg[1].md(), d.pg[1].json() */
  pg: PgProxy;
  /** Entity-level access */
  entities: EntitiesProxy;
  /** Output schema — returns a new DocumentUrl scoped to o_{schema} */
  output: (schema: string) => DocumentUrl;
}

interface EntitiesProxy {
  tables: EntityCollectionProxy;
  figures: EntityCollectionProxy;
}

interface EntityCollectionProxy {
  [index: number]: {
    url: (opts?: { format?: 'json' | 'csv' | 'html' }) => string;
  };
  url: (opts?: UrlBuilderOptions) => string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const FORMAT_TO_EXT: Record<NonNullable<UrlBuilderOptions['format']>, string> = {
  json: 'json',
  csv: 'csv',
  html: 'html',
  markdown: 'md',
  png: 'png',
};

function slugifyFileStem(fileName: string): string {
  const leaf = fileName.split('/').pop() || fileName;
  const noExt = leaf.replace(/\.[A-Za-z0-9]{1,8}$/, '');
  const slug = noExt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'document';
}

function extensionFor(format: string | undefined, fallback: string): string {
  if (!format) return fallback;
  const lower = format.toLowerCase();
  if (lower === 'markdown') return 'md';
  return FORMAT_TO_EXT[lower as keyof typeof FORMAT_TO_EXT] || lower;
}

/**
 * Build-time URL builder — Cloudinary for documents.
 *
 * ```tsx
 * import { doc } from 'okrapdf';
 * const d = doc('doc_7fK3x');
 * <Image src={d.thumbnail.url()} />
 * <a href={d.entities.tables[0].url({ format: 'csv' })}>CSV</a>
 * ```
 */
export function doc(
  documentId: string,
  baseUrlOrOptions: string | DocUrlOptions = DEFAULT_BASE_URL,
  maybeOptions: DocUrlOptions = {},
): DocumentUrl {
  const baseUrl = typeof baseUrlOrOptions === 'string' ? baseUrlOrOptions : DEFAULT_BASE_URL;
  const options = typeof baseUrlOrOptions === 'string' ? maybeOptions : baseUrlOrOptions;

  const base = baseUrl.replace(/\/+$/, '');
  const defaultProvider = options.provider;
  const defaultImage = options.placeholder || options.defaultImage;
  const defaultOutput = options.output;
  const docBase = `${base}/v1/documents/${encodeURIComponent(documentId)}`;
  const artifactBase = options.fileName
    ? slugifyFileStem(options.fileName)
    : 'document';

  const formatParams = (opts?: UrlBuilderOptions) => {
    const params = new URLSearchParams();
    if (opts?.format) params.set('format', opts.format);
    if (opts?.include?.length) params.set('include', opts.include.join(','));
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  };

  /** Single path for all modifier → URL serialization. */
  const buildUrl = (
    resource: string,
    opts?: {
      placeholder?: string;
      provider?: string;
      output?: string;
      transform?: DeliveryTransform;
      artifact?: { stem: string; ext: string };
      qs?: string;
    },
  ): string => {
    const mods: Modifiers = {};

    const prov = opts?.provider || defaultProvider;
    if (prov) mods.variant = prov;

    const ph = opts?.placeholder || defaultImage;
    if (ph) mods.default = ph;

    const out = opts?.output || defaultOutput;
    if (out) mods.output = out;

    if (opts?.transform) {
      validateTransform(opts.transform);
      mods.transform = opts.transform;
    }

    const segs = buildModifierSegments(mods);
    const modPath = segs.length > 0 ? `/${segs.join('/')}` : '';
    const resourcePart = resource ? `/${resource}` : '';
    const artifactSuffix = opts?.artifact ? `/${opts.artifact.stem}.${opts.artifact.ext}` : '';
    const qs = opts?.qs || '';
    return `${docBase}${modPath}${resourcePart}${artifactSuffix}${qs}`;
  };

  const makeEntityCollection = (type: string): EntityCollectionProxy => {
    return new Proxy({} as EntityCollectionProxy, {
      get(_target, prop) {
        if (prop === 'url') {
          return (opts?: UrlBuilderOptions) =>
            buildUrl(`entities/${type}`, {
              provider: opts?.provider,
              transform: opts?.transform,
              artifact: { stem: artifactBase, ext: extensionFor(opts?.format, 'json') },
              qs: formatParams(opts),
            });
        }
        const index = typeof prop === 'string' ? parseInt(prop, 10) : NaN;
        if (!isNaN(index)) {
          return {
            url: (opts?: { format?: string; provider?: string }) =>
              buildUrl(`entities/${type}/${index}`, {
                provider: opts?.provider,
                artifact: { stem: artifactBase, ext: extensionFor(opts?.format, 'json') },
                qs: opts?.format ? `?format=${opts.format}` : '',
              }),
          };
        }
        return undefined;
      },
    });
  };

  const makePgPage = (pageNum: number): PgPage => ({
    png: (opts?: { placeholder?: string; transform?: DeliveryTransform }) =>
      buildUrl(`pg_${pageNum}.png`, { placeholder: opts?.placeholder, transform: opts?.transform }),
    md: (opts?: { transform?: DeliveryTransform }) =>
      buildUrl(`pg_${pageNum}.md`, { transform: opts?.transform }),
    json: (opts?: { transform?: DeliveryTransform }) =>
      buildUrl(`pg_${pageNum}.json`, { transform: opts?.transform }),
  });

  const makePgRange = (segment: string): PgPageRange => ({
    md: (opts?: { transform?: DeliveryTransform }) =>
      buildUrl(`pg_${segment}.md`, { transform: opts?.transform }),
    json: (opts?: { transform?: DeliveryTransform }) =>
      buildUrl(`pg_${segment}.json`, { transform: opts?.transform }),
  });

  const pg: PgProxy = new Proxy({} as PgProxy, {
    get(_target, prop) {
      if (prop === 'range') {
        return (start: number, end: number) => makePgRange(`${start}-${end}`);
      }
      if (prop === 'list') {
        return (...pages: number[]) => makePgRange(pages.join(','));
      }
      const pageNum = typeof prop === 'string' ? parseInt(prop, 10) : NaN;
      if (!isNaN(pageNum)) {
        return makePgPage(pageNum);
      }
      return undefined;
    },
  });

  const buildDocumentUrl = (outputOverride?: string): DocumentUrl => ({
    url: (opts?: UrlBuilderOptions) =>
      buildUrl('', {
        provider: opts?.provider,
        output: outputOverride,
        transform: opts?.transform,
        artifact: { stem: artifactBase, ext: extensionFor(opts?.format, 'json') },
        qs: formatParams(opts),
      }),
    thumbnail: {
      url: (opts?: { transform?: DeliveryTransform }) =>
        buildUrl('pg_1.png', { transform: opts?.transform }),
    },
    full: {
      md: () => `${docBase}/full.md`,
    },
    download: () => `${base}/document/${encodeURIComponent(documentId)}/download`,
    pg,
    entities: {
      tables: makeEntityCollection('tables'),
      figures: makeEntityCollection('figures'),
    },
    output: (schema: string) => {
      // Return a new builder with the output schema baked in.
      // We create a new doc() call with the output option set.
      return doc(documentId, baseUrl, { ...options, output: schema });
    },
  });

  return buildDocumentUrl();
}
