// src/app/page.tsx (新しいコードにすべて置き換えてください)
"use client";

import { useState, useCallback, useMemo } from "react";
import { Player, Match } from "@/type";
import { generatePairings } from "@/utils/swiss";

// Top 8 トーナメントのプレイヤータイプ
type Top8Player = Pick<Player, 'id' | 'name'>;

// トーナメントの試合結果を保持するための型（QF, SF, Finalsで共通）
type TournamentMatch = {
  id: string;
  player1: Top8Player;
  player2: Top8Player;
  seed1?: number; // QFのみ
  seed2?: number; // QFのみ
  winner: Top8Player | null; // 勝利者を記録
};

type TournamentStage = 'QF' | 'SF' | 'Finals' | 'Champion' | null;

export default function Home() {
  // 状態管理
  const [players, setPlayers] = useState<Player[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [matches, setMatches] = useState<Match[]>([]); // Swiss Match
  const [round, setRound] = useState(0);
  const [isTournamentStarted, setIsTournamentStarted] = useState(false);
  const [isTournamentFinished, setIsTournamentFinished] = useState(false); 

  // 本戦トーナメント用の状態
  const [top8Players, setTop8Players] = useState<Top8Player[]>([]);
  const [qfMatches, setQfMatches] = useState<TournamentMatch[]>([]);
  const [sfMatches, setSfMatches] = useState<TournamentMatch[]>([]);
  const [finalMatch, setFinalMatch] = useState<TournamentMatch | null>(null);
  const [champion, setChampion] = useState<Top8Player | null>(null);
  const [tournamentStage, setTournamentStage] = useState<TournamentStage>(null);

  // プレイヤー追加 (変更なし)
  const addPlayer = () => {
    if (!inputValue.trim()) return;
    const newPlayer: Player = {
      id: crypto.randomUUID(),
      name: inputValue,
      points: 0,
      matchHistory: [],
      hasBye: false,
      isDropped: false,
    };
    setPlayers([...players, newPlayer]);
    setInputValue("");
  };

  // --- 【★追加・修正★】スイスドローの勝敗登録・修正関数 ---
  const handleSwissResult = (matchIndex: number, newWinnerId: string) => {
    const newMatches = [...matches];
    const match = newMatches[matchIndex];
    
    // 既に勝敗が登録されている場合、古い勝者のID
    const oldWinnerId = match.winnerId;

    // 既に登録されている勝者と同じプレイヤーが押された場合、処理をスキップ（またはクリアする動作にしても良いが、ここでは修正のみ）
    if (oldWinnerId === newWinnerId) {
        return;
    }

    match.winnerId = newWinnerId;
    setMatches(newMatches);

    // プレイヤーデータの更新 (ポイントの修正を含む)
    const updatedPlayers = players.map((p) => {
      let newPoints = p.points;

      // 1. 古い勝者のポイントを戻す
      if (p.id === oldWinnerId) {
        newPoints -= 3;
      }

      // 2. 新しい勝者のポイントを加算
      if (p.id === newWinnerId) {
        newPoints += 3;
      }
      
      // 不戦勝（Bye）の場合のhasByeフラグは変更しない
      const isByeWin = match.player2 === null;

      // 履歴は勝敗登録の度に更新されるため、ここではポイントのみに着目
      if (p.id === oldWinnerId || p.id === newWinnerId || p.id === match.player1.id || (match.player2 && p.id === match.player2.id)) {
        // ポイントを更新
        return { 
            ...p, 
            points: newPoints, 
            // 履歴は既に handleWin のロジックで対応済みだが、念のため再計算
            // 今回はポイント修正がメインなので、ポイントのみ更新
            hasBye: isByeWin && p.id === newWinnerId ? true : p.hasBye,
        };
      }
      return p;
    });
    
    setPlayers(updatedPlayers);
  };
  // ----------------------------------------------------

  // --- 【★追加★】トーナメントの勝敗登録・修正関数 ---
  const handleTournamentResult = (stage: 'QF' | 'SF' | 'Finals', matchIndex: number, winner: Top8Player) => {
    let newMatches: TournamentMatch[];
    let targetMatch: TournamentMatch;
    
    if (stage === 'QF') {
        newMatches = [...qfMatches];
        targetMatch = newMatches[matchIndex];
    } else if (stage === 'SF') {
        newMatches = [...sfMatches];
        targetMatch = newMatches[matchIndex];
    } else { // Finals
        targetMatch = finalMatch!;
        newMatches = [targetMatch]; // 配列として扱う
    }

    // 既に勝者が登録されており、同じプレイヤーを再度押した場合（Undo/Clear）
    if (targetMatch.winner?.id === winner.id) {
        targetMatch.winner = null;
    } else {
        // 新しい勝者を登録（Correction）
        targetMatch.winner = winner;
    }

    if (stage === 'QF') {
        setQfMatches(newMatches);
        // QFの結果に基づきSFの組み合わせを自動計算
        checkAndSetSfPairings(newMatches);
    } else if (stage === 'SF') {
        setSfMatches(newMatches);
        // SFの結果に基づきFinalsの組み合わせを自動計算
        checkAndSetFinalsPairing(newMatches);
    } else { // Finals
        setFinalMatch(targetMatch);
        // Finalsの結果に基づきChampionを決定
        if (targetMatch.winner) {
            setChampion(targetMatch.winner);
            setTournamentStage('Champion');
        } else {
            setChampion(null);
            setTournamentStage('Finals');
        }
    }
  };
  // ----------------------------------------------------

  // QFの結果からSFの組み合わせを設定
  const checkAndSetSfPairings = (qfResults: TournamentMatch[]) => {
    const qfWinners = qfResults.map(m => m.winner).filter(w => w !== null);
    
    // QF全試合が完了した場合のみ
    if (qfWinners.length === 4) {
      setTournamentStage('SF');
      const pairings: TournamentMatch[] = [
        { id: 'sf1', player1: qfWinners[0]!, player2: qfWinners[1]!, winner: null }, // QF1勝者 vs QF2勝者
        { id: 'sf2', player1: qfWinners[2]!, player2: qfWinners[3]!, winner: null }  // QF3勝者 vs QF4勝者
      ];
      setSfMatches(pairings);
    } else {
        setTournamentStage('QF');
        setSfMatches([]); // 未完了ならクリア
        setFinalMatch(null);
        setChampion(null);
    }
  };

  // SFの結果からFinalsの組み合わせを設定
  const checkAndSetFinalsPairing = (sfResults: TournamentMatch[]) => {
    const sfWinners = sfResults.map(m => m.winner).filter(w => w !== null);
    
    // SF全試合が完了した場合のみ
    if (sfWinners.length === 2) {
      setTournamentStage('Finals');
      const finalMatch: TournamentMatch = {
        id: 'final',
        player1: sfWinners[0]!,
        player2: sfWinners[1]!,
        winner: null
      };
      setFinalMatch(finalMatch);
    } else {
        setTournamentStage('SF');
        setFinalMatch(null);
        setChampion(null);
    }
  };

  // トーナメント開始・次ラウンドへ
  const startNextRound = () => {
    const currentRoundNumber = round;

    // Round 1以降の終了判定
    if (currentRoundNumber > 0) {
        const maxPossiblePoints = currentRoundNumber * 3;
        const undefeatedPlayers = players.filter(p => !p.isDropped && p.points === maxPossiblePoints);

        if (undefeatedPlayers.length === 1) {
            setIsTournamentFinished(true);
            alert(`全勝者 (${undefeatedPlayers[0].name}) が1人になりました。\n大会を終了し、本戦トーナメント組み合わせを決定します。`);
            
            // 順位でソート
            const sortedPlayers = [...players]
                .sort((a, b) => b.points - a.points)
                .filter(p => !p.isDropped);
            
            const top8 = sortedPlayers.slice(0, 8).map(p => ({ id: p.id, name: p.name }));
            setTop8Players(top8);

            // QFの組み合わせ作成 (8人以上の場合のみ)
            if (top8.length >= 8) {
                const qfPairings: TournamentMatch[] = [
                    { id: 'qf1', player1: top8[0], seed1: 1, player2: top8[7], seed2: 8, winner: null }, // #1 vs #8
                    { id: 'qf2', player1: top8[3], seed1: 4, player2: top8[4], seed2: 5, winner: null }, // #4 vs #5
                    { id: 'qf3', player1: top8[2], seed1: 3, player2: top8[5], seed2: 6, winner: null }, // #3 vs #6
                    { id: 'qf4', player1: top8[1], seed1: 2, player2: top8[6], seed2: 7, winner: null }, // #2 vs #7
                ];
                setQfMatches(qfPairings);
                setTournamentStage('QF');
            }
            return; 
        }
    }

    // スイスドロー進行ロジック (Byeポイント加算含む)
    const newMatches = generatePairings(players);
    let updatedPlayers = [...players];
    const byeMatch = newMatches.find((m) => m.player2 === null);

    if (byeMatch) {
      const byePlayerId = byeMatch.player1.id;
      
      updatedPlayers = updatedPlayers.map((p) => {
        if (p.id === byePlayerId) {
          // Byeは強制勝利（+3pts）として扱う
          const isMatchAlreadyCompleted = matches.some(m => m.id === byeMatch.id && m.winnerId !== null);

          if (!isMatchAlreadyCompleted) {
             return { ...p, points: p.points + 3, hasBye: true };
          }
        }
        return p;
      });
    }

    setPlayers(updatedPlayers); 
    setMatches(newMatches);
    setRound(round + 1);
    setIsTournamentStarted(true);
  };

  // UIのレンダリングをシンプルにするためのヘルパーコンポーネント
  const TournamentMatchDisplay = ({ match, index, stage, handler }: { match: TournamentMatch, index: number, stage: 'QF' | 'SF' | 'Finals', handler: (index: number, winner: Top8Player) => void }) => {
    const isFinal = stage === 'Finals';
    const isChampionDeclared = stage === 'Finals' && match.winner;
    const stageName = isFinal ? 'FINAL' : (stage === 'SF' ? `SF ${index + 1}` : `QF ${index + 1}`);

    return (
        <div key={match.id} className={`bg-white p-3 rounded-lg border border-gray-300 shadow-md ${isChampionDeclared ? 'bg-yellow-200 border-yellow-500' : (isFinal ? 'bg-red-100' : 'bg-indigo-100')}`}>
            <h4 className={`text-center font-bold mb-2 ${isFinal ? 'text-xl text-red-700' : 'text-md text-indigo-700'}`}>{stageName}</h4>
            
            <div className="flex justify-between items-center text-sm font-semibold">
                {/* Player 1 */}
                <div className={`w-2/5 text-left flex items-center ${match.winner?.id === match.player1.id ? 'font-extrabold text-green-700' : ''}`}>
                    {match.seed1 && <span className="text-xs text-gray-500 mr-1">({match.seed1}位)</span>}
                    <span className="truncate">{match.player1.name}</span>
                </div>
                
                {/* Button 1 */}
                <button
                    onClick={() => handler(index, match.player1)}
                    className={`px-2 py-0.5 text-xs rounded transition-colors ${
                        match.winner?.id === match.player1.id 
                            ? 'bg-green-600 text-white hover:bg-green-700' 
                            : 'bg-gray-200 hover:bg-gray-300'
                    }`}
                >
                    {match.winner?.id === match.player1.id ? (isFinal ? '優勝決定' : 'WINNER') : '勝'}
                </button>

                <span className="font-bold text-gray-700 px-2">VS</span>
                
                {/* Button 2 */}
                <button
                    onClick={() => handler(index, match.player2)}
                    className={`px-2 py-0.5 text-xs rounded transition-colors ${
                        match.winner?.id === match.player2.id 
                            ? 'bg-green-600 text-white hover:bg-green-700' 
                            : 'bg-gray-200 hover:bg-gray-300'
                    }`}
                >
                    {match.winner?.id === match.player2.id ? (isFinal ? '優勝決定' : 'WINNER') : '勝'}
                </button>
                
                {/* Player 2 */}
                <div className={`w-2/5 text-right flex items-center justify-end ${match.winner?.id === match.player2.id ? 'font-extrabold text-green-700' : ''}`}>
                    <span className="truncate">{match.player2.name}</span>
                    {match.seed2 && <span className="text-xs text-gray-500 ml-1">({match.seed2}位)</span>}
                </div>
            </div>
        </div>
    );
  };
  // ----------------------------------------------------

  return (
    <div className="min-h-screen bg-gray-100 p-8 font-sans text-gray-900">
      <div className="max-w-2xl mx-auto bg-white shadow-lg rounded-lg p-6">
        <h1 className="text-2xl font-bold mb-6 text-center border-b pb-4">
          デュエマ 対戦マッチング (Swiss Draw)
        </h1>

        {/* 参加登録フェーズ */}
        {!isTournamentStarted && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-2">参加者登録 ({players.length}人)</h2>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addPlayer()}
                placeholder="プレイヤー名を入力"
                className="flex-1 border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={addPlayer}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                追加
              </button>
            </div>
            <ul className="grid grid-cols-2 gap-2 text-sm">
              {players.map((p) => (
                <li key={p.id} className="bg-gray-50 px-3 py-1 rounded border">
                  {p.name}
                </li>
              ))}
            </ul>
            {players.length >= 2 && (
              <button
                onClick={startNextRound}
                className="w-full mt-4 bg-green-600 text-white py-3 rounded font-bold hover:bg-green-700 shadow"
              >
                大会を開始する
              </button>
            )}
          </div>
        )}

        {/* スイスドロー / トーナメント フェーズ */}
        {isTournamentStarted && (
          <div>
            {isTournamentFinished ? (
                // --- トーナメント画面 ---
                <div className="text-center p-8 border-4 border-yellow-500 bg-yellow-50 rounded-lg mb-8">
                    <h2 className="text-2xl font-bold text-yellow-700 mb-4">
                        {champion ? `👑 優勝者: ${champion.name} 👑` : '🏆 予選スイスドロー終了 🏆'}
                    </h2>
                    
                    <div className="mt-6 border-t pt-4">
                      <h3 className="font-bold mb-4 text-xl border-b pb-2 text-indigo-700">⚔️ 本戦トーナメント ⚔️</h3>
                      
                      {top8Players.length < 8 ? (
                          <p className="text-red-500 font-semibold">参加者が8名未満のため、本戦トーナメントの組み合わせは作成されませんでした。</p>
                      ) : (
                          <div className="space-y-6">
                              {/* 準々決勝 (QF) */}
                              <div className="border p-3 rounded-lg bg-white shadow">
                                <h4 className="font-bold text-lg mb-3">準々決勝 (QF) - Top 8</h4>
                                <div className="space-y-3">
                                    {qfMatches.map((match, index) => (
                                        <TournamentMatchDisplay 
                                            key={match.id} 
                                            match={match} 
                                            index={index} 
                                            stage="QF" 
                                            handler={(i, w) => handleTournamentResult('QF', i, w)} 
                                        />
                                    ))}
                                </div>
                              </div>

                              {/* 準決勝 (SF) */}
                              {tournamentStage && ['SF', 'Finals', 'Champion'].includes(tournamentStage) && (
                                <div className="border p-3 rounded-lg bg-white shadow">
                                    <h4 className="font-bold text-lg mb-3">準決勝 (SF) - Top 4</h4>
                                    <div className="space-y-3">
                                        {sfMatches.map((match, index) => (
                                            <TournamentMatchDisplay 
                                                key={match.id} 
                                                match={match} 
                                                index={index} 
                                                stage="SF" 
                                                handler={(i, w) => handleTournamentResult('SF', i, w)} 
                                            />
                                        ))}
                                    </div>
                                </div>
                              )}

                              {/* 決勝 (Finals) */}
                              {tournamentStage && ['Finals', 'Champion'].includes(tournamentStage) && finalMatch && (
                                <div className="border p-3 rounded-lg bg-white shadow">
                                    <h4 className="font-bold text-xl mb-3 text-red-700">決勝戦 (Finals)</h4>
                                    <div className="space-y-3">
                                        <TournamentMatchDisplay 
                                            match={finalMatch} 
                                            index={0} 
                                            stage="Finals" 
                                            handler={(i, w) => handleTournamentResult('Finals', i, w)} 
                                        />
                                    </div>
                                </div>
                              )}
                          </div>
                      )}
                    </div>
                </div>
            ) : (
                // --- スイスドロー進行中 ---
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">Round {round}</h2>
                    <button
                        onClick={startNextRound}
                        // 全試合の結果が出るまで押せない簡易制御
                        disabled={matches.some((m) => !m.winnerId)}
                        className={`px-4 py-2 rounded text-sm font-bold ${
                            matches.some((m) => !m.winnerId)
                                ? "bg-gray-300 cursor-not-allowed"
                                : "bg-indigo-600 text-white hover:bg-indigo-700"
                        }`}
                    >
                        次のラウンドへ
                    </button>
                </div>
            )}

            {/* スイスドロー マッチリスト（トーナメント移行後は非表示） */}
            {!isTournamentFinished && (
                <div className="space-y-4">
                    {matches.map((match, index) => (
                        <div key={match.id} className="border rounded-lg p-4 bg-gray-50 flex justify-between items-center">
                            {/* Player 1 */}
                            <div className={`flex-1 text-center ${match.winnerId === match.player1.id ? "font-bold text-green-700" : ""}`}>
                                <div className="text-lg">{match.player1.name}</div>
                                <div className="text-xs text-gray-500">{match.player1.points} pts</div>
                                <button
                                    onClick={() => handleSwissResult(index, match.player1.id)}
                                    className={`mt-2 px-3 py-1 text-sm rounded transition-colors ${
                                        match.winnerId === match.player1.id ? "bg-green-500 text-white" : "bg-gray-200 hover:bg-gray-300"
                                    }`}
                                >
                                    {match.winnerId === match.player1.id ? "WINNER (修正可)" : "勝"}
                                </button>
                            </div>

                            <div className="px-4 font-bold text-gray-400">VS</div>

                            {/* Player 2 (or Bye) */}
                            {match.player2 ? (
                                <div className={`flex-1 text-center ${match.winnerId === match.player2.id ? "font-bold text-green-700" : ""}`}>
                                    <div className="text-lg">{match.player2.name}</div>
                                    <div className="text-xs text-gray-500">{match.player2.points} pts</div>
                                    <button
                                        onClick={() => handleSwissResult(index, match.player2!.id)}
                                        className={`mt-2 px-3 py-1 text-sm rounded transition-colors ${
                                            match.winnerId === match.player2.id ? "bg-green-500 text-white" : "bg-gray-200 hover:bg-gray-300"
                                        }`}
                                    >
                                        {match.winnerId === match.player2.id ? "WINNER (修正可)" : "勝"}
                                    </button>
                                </div>
                            ) : (
                                <div className="flex-1 text-center text-gray-500">
                                    <span className="font-bold">不戦勝 (Bye)</span>
                                    <div className="text-xs">自動勝利 (+3pts)</div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* 簡易順位表 */}
            <div className="mt-8 border-t pt-4">
                <h3 className="font-bold mb-2">
                    {isTournamentFinished ? "最終予選順位" : `現在の順位 (Round ${round}終了時)`}
                </h3>
                <table className="w-full text-sm text-left">
                    <thead>
                    <tr className="border-b">
                        <th className="py-1">#</th>
                        <th>Name</th>
                        <th>Pts</th>
                    </tr>
                    </thead>
                    <tbody>
                    {[...players].sort((a, b) => b.points - a.points).map((p, i) => (
                        <tr key={p.id} className="border-b last:border-0">
                            <td className="py-2">{i + 1}</td>
                            <td>{p.name}</td>
                            <td>{p.points}</td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}