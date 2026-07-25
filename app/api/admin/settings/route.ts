import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

export async function GET() {
  try {
    const settingsRef = doc(db, 'settings', 'leaderboard');
    const snap = await getDoc(settingsRef);

    if (!snap.exists()) {
      const defaultSettings = {
        enabled: true,
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      };
      await setDoc(settingsRef, { ...defaultSettings, createdAt: serverTimestamp() });
      return NextResponse.json(defaultSettings);
    }

    return NextResponse.json(snap.data());
  } catch (error: any) {
    console.error('Error fetching admin settings:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { enabled, startDate, endDate } = body;

    const settingsRef = doc(db, 'settings', 'leaderboard');
    await setDoc(
      settingsRef,
      {
        enabled: Boolean(enabled),
        startDate: startDate || '',
        endDate: endDate || '',
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ success: true, enabled, startDate, endDate });
  } catch (error: any) {
    console.error('Error updating admin settings:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
