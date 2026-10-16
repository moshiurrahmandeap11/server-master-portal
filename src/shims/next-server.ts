/**
 * Lightweight Standalone Shim for 'next/server'
 * Implements NextResponse with full .cookies.set() support for Express / Node.js
 */

export interface CookieSerializeOptions {
  domain?: string;
  expires?: Date;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  priority?: 'low' | 'medium' | 'high';
  sameSite?: true | false | 'lax' | 'strict' | 'none';
  secure?: boolean;
}

export class ResponseCookies {
  constructor(private headers: Headers) {}

  set(name: string, value: string, options?: CookieSerializeOptions): this {
    let cookieStr = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
    if (options?.path) cookieStr += `; Path=${options.path}`;
    else cookieStr += '; Path=/';
    if (options?.maxAge !== undefined) cookieStr += `; Max-Age=${options.maxAge}`;
    if (options?.domain) cookieStr += `; Domain=${options.domain}`;
    if (options?.sameSite) cookieStr += `; SameSite=${options.sameSite}`;
    if (options?.httpOnly) cookieStr += '; HttpOnly';
    if (options?.secure) cookieStr += '; Secure';
    if (options?.expires) cookieStr += `; Expires=${options.expires.toUTCString()}`;

    this.headers.append('Set-Cookie', cookieStr);
    return this;
  }

  delete(name: string): this {
    return this.set(name, '', { maxAge: 0, path: '/' });
  }

  get(name: string): { name: string; value: string } | undefined {
    const raw = this.headers.get('Set-Cookie');
    if (!raw) return undefined;
    const match = raw.match(new RegExp(`(?:^|; )${encodeURIComponent(name)}=([^;]*)`));
    return match ? { name, value: decodeURIComponent(match[1]) } : undefined;
  }

  getAll(): { name: string; value: string }[] {
    const list: { name: string; value: string }[] = [];
    if (typeof (this.headers as any).getSetCookie === 'function') {
      const all = (this.headers as any).getSetCookie();
      for (const str of all) {
        const [pair] = str.split(';');
        const [k, v] = pair.split('=');
        if (k) list.push({ name: decodeURIComponent(k), value: decodeURIComponent(v || '') });
      }
    }
    return list;
  }
}

export class NextResponse extends Response {
  public cookies: ResponseCookies;

  constructor(body?: BodyInit | null, init?: ResponseInit) {
    const headers = new Headers(init?.headers);
    super(body, { ...init, headers });
    this.cookies = new ResponseCookies(this.headers);
  }

  static json(data: any, init?: ResponseInit): NextResponse {
    const headers = new Headers(init?.headers);
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json; charset=utf-8');
    }
    const res = new NextResponse(JSON.stringify(data), {
      ...init,
      status: init?.status ?? 200,
      headers
    });
    return res;
  }

  static redirect(url: string | URL, status: number = 302): NextResponse {
    const headers = new Headers();
    headers.set('Location', typeof url === 'string' ? url : url.toString());
    return new NextResponse(null, {
      status,
      headers
    });
  }
}

export type NextRequest = Request;
export default NextResponse;
