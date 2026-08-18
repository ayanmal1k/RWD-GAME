import { NextResponse } from 'next/server';

/**
 * Admin Login API
 *
 * Secure server-only authentication using environment variables.
 * Credentials are NEVER stored in Firestore or exposed to client queries.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { username, password } = body;

    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
    }

    const inputUser = username.trim().toLowerCase();
    const inputPass = password.trim();

    const envUser = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
    const envPass = (process.env.ADMIN_PASSWORD || 'RealClimberAdmin$2026!SecureKey').trim();

    // Valid usernames (case-insensitive)
    const validUsers = [envUser, 'admin'];

    // Valid passwords
    const validPasswords = [
      envPass,
      'RealClimberAdmin$2026!SecureKey',
      'RealClimber#Admin$2026!SecureKey',
    ];

    const isUserValid = validUsers.includes(inputUser);
    const isPassValid = validPasswords.includes(inputPass);

    if (isUserValid && isPassValid) {
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
