import { Player, Match } from "../type"; // types.tsを参照

export function generatePairings(players: Player[]): Match[] {
  // 1. ドロップしていないプレイヤーを取得
  let activePlayers = players.filter((p) => !p.isDropped);

  // 2. ポイント順（降順）、ランダム順でソート
  activePlayers.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return Math.random() - 0.5;
  });

  const matches: Match[] = [];
  const pairedIds = new Set<string>();

  // 3. 奇数の場合、不戦勝 (Bye) を決定
  if (activePlayers.length % 2 !== 0) {
    let byeCandidateIndex = activePlayers.length - 1;
    while (byeCandidateIndex >= 0) {
      if (!activePlayers[byeCandidateIndex].hasBye) break;
      byeCandidateIndex--;
    }
    if (byeCandidateIndex < 0) byeCandidateIndex = activePlayers.length - 1;

    const byePlayer = activePlayers.splice(byeCandidateIndex, 1)[0];
    matches.push({
      id: crypto.randomUUID(),
      player1: byePlayer,
      player2: null,
      winnerId: byePlayer.id,
    });
    pairedIds.add(byePlayer.id);
  }

  // 4. 上位からペアリングを作成
  for (let i = 0; i < activePlayers.length; i++) {
    const p1 = activePlayers[i];
    if (pairedIds.has(p1.id)) continue;

    let p2: Player | null = null;

    // 対戦相手を探す
    for (let j = i + 1; j < activePlayers.length; j++) {
      const candidate = activePlayers[j];
      if (!pairedIds.has(candidate.id) && !p1.matchHistory.includes(candidate.id)) {
        p2 = candidate;
        break;
      }
    }

    // 相手が見つからない場合 (再戦OKで探す)
    if (!p2) {
      for (let j = i + 1; j < activePlayers.length; j++) {
        if (!pairedIds.has(activePlayers[j].id)) {
          p2 = activePlayers[j];
          break;
        }
      }
    }

    if (p2) {
      matches.push({
        id: crypto.randomUUID(),
        player1: p1,
        player2: p2,
        winnerId: null,
      });
      pairedIds.add(p1.id);
      pairedIds.add(p2.id);
    }
  }

  return matches;
}