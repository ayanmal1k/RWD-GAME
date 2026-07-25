import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, orderBy, limit, getDocs } from 'firebase/firestore';

export async function GET() {
  try {
    const settingsRef = doc(db, 'settings', 'leaderboard');
    const settingsSnap = await getDoc(settingsRef);

    let settings = {
      enabled: true,
      startDate: '',
      endDate: '',
    };

    if (settingsSnap.exists()) {
      settings = settingsSnap.data() as any;
    }

    if (!settings.enabled) {
      return NextResponse.json({
        enabled: false,
        message: 'Leaderboard is currently disabled by Admin.',
        topPlayers: [],
      });
    }

    // Fetch top scores ordered by highest score
    const q = query(collection(db, 'game_history'), orderBy('score', 'desc'), limit(100));
    const snapshot = await getDocs(q);

    // Map to keep only the highest score for each unique user address
    const userBestMap = new Map<string, { userAddress: string; score: number; coins: number; durationSeconds: number; createdAt: any }>();

    snapshot.docs.forEach((d) => {
      const data = d.data();
      const addr = data.userAddress || 'Anonymous';
      // First occurrence is highest score because query is sorted desc
      if (!userBestMap.has(addr)) {
        userBestMap.set(addr, {
          userAddress: addr,
          score: data.score || 0,
          coins: data.coins || 0,
          durationSeconds: data.durationSeconds || 0,
          createdAt: data.createdAt,
        });
      }
    });

    const topPlayers = Array.from(userBestMap.values())
      .slice(0, 15)
      .map((player, index) => ({
        rank: index + 1,
        ...player,
      }));

    return NextResponse.json({
      enabled: true,
      startDate: settings.startDate,
      endDate: settings.endDate,
      topPlayers,
    });
  } catch (error: any) {
    console.error('Error fetching leaderboard:', error);
    return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
  }
}
