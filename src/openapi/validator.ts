import Ajv, { ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import { spec, componentSchema } from './spec';

// STRICT_CONTRACT=false tolerates fields the server returns but Swagger does not document.
const strict = process.env.STRICT_CONTRACT !== 'false';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
for (const f of ['int32', 'int64', 'double', 'float']) ajv.addFormat(f, true);

function relax(node: any): any {
  if (Array.isArray(node)) return node.map(relax);
  if (node && typeof node === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === 'additionalProperties' && v === false && !strict) continue;
      out[k] = relax(v);
    }
    return out;
  }
  return node;
}

ajv.addSchema(relax({ components: spec.components }), 'spec');

// The gateway wraps every body: { success, status, message, data, meta: { pagination? } }
const envelope = {
  type: 'object',
  required: ['success', 'status'],
  properties: {
    success: { type: 'boolean' },
    status: { type: 'integer' },
    message: { type: 'string', nullable: true },
    meta: {
      type: 'object',
      properties: {
        requestId: { type: 'string' },
        pagination: {
          type: 'object',
          required: ['totalPages', 'totalElements', 'offset', 'limit'],
          properties: {
            totalPages: { type: 'integer', minimum: 0 },
            totalElements: { type: 'integer', minimum: 0 },
            offset: { type: 'integer' },
            limit: { type: 'integer' },
          },
        },
      },
    },
    error: {
      type: 'object',
      required: ['title', 'status'],
      properties: { title: { type: 'string' }, status: { type: 'integer' }, code: { type: 'string' } },
    },
  },
};
const validateEnvelope = ajv.compile(envelope);

const format = (errors: ErrorObject[] | null | undefined) =>
  (errors ?? []).slice(0, 15).map(e => `  ${e.instancePath || '(root)'} ${e.message}${e.params && 'additionalProperty' in e.params ? `: "${e.params.additionalProperty}"` : ''}`).join('\n');

export function checkEnvelope(input: unknown, httpStatus?: number): string[] {
  const body: any = input;
  if (!validateEnvelope(input)) return [`Response envelope:\n${format(validateEnvelope.errors)}`];
  const problems: string[] = [];
  if (httpStatus !== undefined) {
    if (body.status !== httpStatus) problems.push(`body.status is ${body.status} but HTTP status is ${httpStatus}`);
    if (body.success !== httpStatus < 400) problems.push(`body.success is ${body.success} for HTTP ${httpStatus}`);
    if (httpStatus >= 400 && !body.error) problems.push('error response without an "error" object');
    if (httpStatus < 400 && body.error) problems.push('success response contains an "error" object');
  }
  if (!body.meta?.requestId) problems.push('meta.requestId is missing');
  if (body.meta?.timestamp && Number.isNaN(Date.parse(body.meta.timestamp))) problems.push(`meta.timestamp "${body.meta.timestamp}" is not a date`);
  return problems;
}

/**
 * Validate `data` against a Swagger component schema.
 * "*PagedResult" schemas describe { items: [...] }, but the server returns the items as `data`
 * (paging lives in meta.pagination), so each element is validated against the item schema.
 */
export function checkSchema(schemaName: string, data: unknown): string[] {
  const schema = componentSchema(schemaName);
  if (!schema) return [`Schema "${schemaName}" not found in Swagger`];

  let ref = `spec#/components/schemas/${schemaName}`;
  let target = data;
  if (/PagedResult$/.test(schemaName) && Array.isArray(data)) {
    const itemRef = schema.properties?.items?.items?.$ref as string | undefined;
    if (itemRef) {
      ref = `spec${itemRef}`;
      target = data;
      const validateItem = ajv.getSchema(ref)!;
      const errs = (data as unknown[]).flatMap((item, i) =>
        validateItem(item) ? [] : [`data[${i}] vs ${itemRef.split('/').pop()}:\n${format(validateItem.errors)}`]);
      return errs.slice(0, 3);
    }
  }
  const validate = ajv.getSchema(ref)!;
  return validate(target) ? [] : [`data vs ${schemaName}:\n${format(validate.errors)}`];
}
