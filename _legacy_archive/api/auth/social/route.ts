import { NextResponse } from 'next/server';
import { POST as handleGooglePost } from './google/route';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { provider } = body;

    if (provider === 'google' || body?.credential) {
      const forwardReq = new Request(req.url, {
        method: 'POST',
        headers: req.headers,
        body: JSON.stringify(body)
      });
      return handleGooglePost(forwardReq);
    }

    return NextResponse.json({ error: 'শুধুমাত্র গুগল সাইন-ইন সমর্থিত।' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Social auth failed' }, { status: 500 });
  }
}
