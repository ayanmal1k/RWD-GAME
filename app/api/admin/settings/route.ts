import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getGameSettings, DEFAULT_GAME_SETTINGS } from '@/lib/gameSettings';

export async function GET() {
  try {
    const settings = await getGameSettings();
    return NextResponse.json(settings);
  } catch (error: any) {
    console.error('Error fetching admin settings:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      gameFeeAmount,
      minRwdRequired,
      coinsPerToken,
      minWithdrawCoins,
      leaderboardEnabled,
      enabled, // backward compat
      startDate,
      endDate,
    } = body;

    const isLeaderboardEnabled = leaderboardEnabled !== undefined ? Boolean(leaderboardEnabled) : (enabled !== undefined ? Boolean(enabled) : true);
    const parsedGameFee = typeof gameFeeAmount === 'number' && gameFeeAmount >= 0 ? gameFeeAmount : Number(gameFeeAmount) || DEFAULT_GAME_SETTINGS.gameFeeAmount;
    const parsedMinRwd = typeof minRwdRequired === 'number' && minRwdRequired >= 0 ? minRwdRequired : Number(minRwdRequired) || 0;
    const parsedCoinsPerToken = typeof coinsPerToken === 'number' && coinsPerToken > 0 ? coinsPerToken : Number(coinsPerToken) || DEFAULT_GAME_SETTINGS.coinsPerToken;
    const parsedMinWithdrawCoins = typeof minWithdrawCoins === 'number' && minWithdrawCoins >= 0 ? minWithdrawCoins : Number(minWithdrawCoins) || DEFAULT_GAME_SETTINGS.minWithdrawCoins;

    const updatedSettings = {
      gameFeeAmount: parsedGameFee,
      minRwdRequired: parsedMinRwd,
      coinsPerToken: parsedCoinsPerToken,
      minWithdrawCoins: parsedMinWithdrawCoins,
      leaderboardEnabled: isLeaderboardEnabled,
      startDate: startDate || '',
      endDate: endDate || '',
      updatedAt: serverTimestamp(),
    };

    // Save to primary settings/game_config document
    const configRef = doc(db, 'settings', 'game_config');
    await setDoc(configRef, updatedSettings, { merge: true });

    // Sync to legacy settings/leaderboard document for backward compatibility
    const lbRef = doc(db, 'settings', 'leaderboard');
    await setDoc(
      lbRef,
      {
        enabled: isLeaderboardEnabled,
        startDate: startDate || '',
        endDate: endDate || '',
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({
      success: true,
      settings: {
        gameFeeAmount: parsedGameFee,
        minRwdRequired: parsedMinRwd,
        coinsPerToken: parsedCoinsPerToken,
        minWithdrawCoins: parsedMinWithdrawCoins,
        leaderboardEnabled: isLeaderboardEnabled,
        startDate: startDate || '',
        endDate: endDate || '',
      },
    });
  } catch (error: any) {
    console.error('Error updating admin settings:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
