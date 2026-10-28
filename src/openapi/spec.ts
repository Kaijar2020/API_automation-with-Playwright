import fs from 'fs';
import path from 'path';

// Swagger / OpenAPI 3 document that drives the contract tests.
export const SPEC_FILE = path.resolve(__dirname, '..', '..', process.env.SWAGGER_FILE ?? 'swagger/prescription.json');
export const spec = JSON.parse(fs.readFileSync(SPEC_FILE, 'utf-8'));

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface Param {
  name: string;
  in: 'path' | 'query' | 'header';
  required?: boolean;
  schema?: { type?: string; format?: string; enum?: string[]; $ref?: string };
}

export interface Operation {
  method: HttpMethod;
  /** Full path from the spec, e.g. /api/v1/prescription/Advices/{id} */
  path: string;
  tag: string;
  params: Param[];
  /** status code -> component schema name (undefined when the spec documents no body) */
  responses: Record<string, string | undefined>;
  /** Content types of the success response, e.g. application/pdf */
  produces: string[];
  /** "GET /api/v1/prescription/Advices/{id}" */
  key: string;
}

const refName = (ref?: string) => ref?.split('/').pop();

export const operations: Operation[] = Object.entries<any>(spec.paths).flatMap(([p, item]) =>
  (['get', 'post', 'put', 'patch', 'delete'] as HttpMethod[])
    .filter(m => item[m])
    .map(m => {
      const op = item[m];
      const responses: Record<string, string | undefined> = {};
      const produces = new Set<string>();
      for (const [code, r] of Object.entries<any>(op.responses ?? {})) {
        responses[code] = refName(r.content?.['application/json']?.schema?.$ref);
        if (code.startsWith('2')) Object.keys(r.content ?? {}).forEach(c => produces.add(c));
      }
      return {
        method: m,
        path: p,
        tag: op.tags?.[0] ?? p.split('/')[4] ?? 'root',
        params: [...(item.parameters ?? []), ...(op.parameters ?? [])],
        responses,
        produces: [...produces],
        key: `${m.toUpperCase()} ${p}`,
      };
    }),
);

export function findOperation(method: string, fullPath: string): Operation | undefined {
  return operations.find(o => o.method === method.toLowerCase() && o.path.toLowerCase() === fullPath.toLowerCase());
}

export const componentSchema = (name: string) => spec.components?.schemas?.[name];
