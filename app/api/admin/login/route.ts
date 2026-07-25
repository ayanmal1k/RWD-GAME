import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const DEFAULT_ADMIN_USER = 'admin';
const DEFAULT_ADMIN_PASS = 'RealClimber#Admin$2026!SecureKey';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
    }

    // Check credentials in Firestore settings/admin_auth
    const authRef = doc(db, 'settings', 'admin_auth');
    let authSnap = await getDoc(authRef);

    let storedUser = DEFAULT_ADMIN_USER;
    let storedPass = DEFAULT_ADMIN_PASS;

    if (!authSnap.exists()) {
      // Initialize admin credentials document in Firestore
      await setDoc(authRef, {
        username: DEFAULT_ADMIN_USER,
        password: DEFAULT_ADMIN_PASS,
        updatedAt: new Date().toISOString(),
      });
    } else {
      const data = authSnap.data();
      storedUser = data.username || DEFAULT_ADMIN_USER;
      storedPass = data.password || DEFAULT_ADMIN_PASS;
    }

    if (username.trim() === storedUser && password === storedPass) {
      return NextResponse.json({
        success: true,
        message: 'Admin authentication successful',
      });
    }

    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
  } catch (error: any) {
    console.error('Admin login error:', error);
    return NextResponse.json({ error: 'Internal server error during authentication' }, { status: 500 });
  }
}
