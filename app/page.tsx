// app/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
// 必要に応じて、Player, Matchの型定義をここからインポートするか、ファイル内に定義があるか確認してください
import { Player, Match } from "@/type"; 
import { generatePairings } from "@/utils/swiss";

// Firebase Firestore 関連のインポート
import { db } from "@/firebase/config";
import { 
    collection, 
    doc, 
    onSnapshot, 
    setDoc, // リセットに必要
    updateDoc, 
    serverTimestamp 
} from "firebase/firestore";

// --- 型定義 (ファイル内に存在しない場合はここに置く) ---
type Top8Player = Pick<Player, 'id' | 'name'>;
type TournamentMatch = {
  id: string;
  player1: Top8Player;
  player2: Top8Player;
  seed1?: number;
  seed2?: number;
  winner: Top8Player | null;
};
type TournamentStage = 'QF' | 'SF' | 'Finals' | 'Champion' | null;

// --- データベースの状態を表すメインデータ型 ---
interface AppState {
    players: Player[];
    matches: Match[];
    round: number;
    isTournamentStarted: boolean;
    isTournamentFinished: boolean;
    
    top8Players: Top8Player[];
    qfMatches: TournamentMatch[];
    sfMatches: TournamentMatch[];
    finalMatch: TournamentMatch | null;
    champion: Top8Player | null;
    tournamentStage: TournamentStage;
}

// データベース内のドキュメントID
const DOC_ID = "current_tournament"; 

// --- 初期状態定義 ---
const getInitialState = (): AppState => ({
    players: [],
    matches: [],
    round: 0,
    isTournamentStarted: false,
    isTournamentFinished: false,
    top8Players: [],
    qfMatches: [],
    sfMatches: [],
    finalMatch: null,
    champion: null,
    tournamentStage: null,
});

export default function Home() {
    // データベースから取得したデータを保持する state
    const [appState, setAppState] = useState<AppState | null>(null);
    const [inputValue, setInputValue] = useState("");
    const [isLoading, setIsLoading] = useState(true);

    // --- データベースからのデータ購読 (リアルタイム同期) ---
    // app/page.tsx 内の useEffect フック

useEffect(() => {
    const docRef = doc(db, "tournaments", DOC_ID);

    const unsubscribe = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            // データが存在する場合: 状態を更新
            const data = docSnap.data() as AppState;
            setAppState(data);
            setIsLoading(false);
        } else {
            // データが存在しない場合: データベースに初期データを書き込む
            // ※ onSnapshot内で直接処理せず、データが空であることを確認後、
            //    アプリの初期化処理を呼び出すように変更 (initializeStateは既存)
            //    この行の削除/変更は不要ですが、処理を分離します。
            initializeState(); 
        }
        setIsLoading(false);
    }, (error) => {
        // Firebaseからの接続エラー（ネットワーク、認証など）が発生した場合の処理
        console.error("Firebase subscription error:", error);
        
        // 🚨 接続失敗時の最終手段として、強制的に初期化を試みる
        //    これにより、データが見つからない状態を解消できる場合があります。
        //    ※ 本来は不要ですが、公開環境での動作保証のため残します。
        // initializeState(); // この行は既存コードに含まれていないため、無視してください
        
        setIsLoading(false);
    });

    return () => unsubscribe();
}, []);
    // --- データベースへの書き込み処理 ---
    const updateDatabase = useCallback(async (newState: Partial<AppState>) => {
        const docRef = doc(db, "tournaments", DOC_ID);
        try {
            await updateDoc(docRef, newState);
        } catch (error) {
            console.error("Error updating database:", error);
            alert("データの保存に失敗しました。");
        }
    }, []);

    // 初期状態の設定 (データベースが存在しない場合)
    const initializeState = useCallback(async () => {
        const initialState = getInitialState();
        const docRef = doc(db, "tournaments", DOC_ID);
        await setDoc(docRef, initialState);
        setAppState(initialState);
    }, []);
    
    // 大会状態を初期化（リセット）
    const resetTournament = async () => {
        // 最終確認
        if (!confirm("⚠️ 警告: 本当に大会をリセットしますか？この操作は元に戻せません。全ての試合結果、参加者情報が削除されます。")) {
            return;
        }
        
        const initialState = getInitialState();
        const docRef = doc(db, "tournaments", DOC_ID);
        
        try {
            // 既存のドキュメントを初期状態で上書き
            await setDoc(docRef, initialState);
            alert("リセット完了");
        } catch (error) {
            console.error("Error resetting database:", error);
            alert("リセット中にエラーが発生しました。");
        }
    };
    
    // プレイヤー追加 (データベース更新)
    const addPlayer = async () => {
        if (!inputValue.trim() || !appState) return;

        const newPlayer: Player = {
            id: crypto.randomUUID(),
            name: inputValue,
            points: 0,
            matchHistory: [],
            hasBye: false,
            isDropped: false,
        };
        
        await updateDatabase({ players: [...appState.players, newPlayer] });
        setInputValue("");
    };

    // プレイヤーのドロップ/復帰を切り替える (データベース更新)
    const togglePlayerDrop = async (playerId: string) => {
        if (!appState) return;

        const updatedPlayers = appState.players.map((p) => {
            if (p.id === playerId) {
                const newState = !p.isDropped;
                if (newState) {
                    alert(`${p.name} をドロップしました。`);
                } else {
                    alert(`${p.name} を大会に復帰させました。`);
                }
                return { ...p, isDropped: newState };
            }
            return p;
        });

        await updateDatabase({ players: updatedPlayers });
    };

    // --- スイスドローの勝敗登録・修正関数 (データベース更新) ---
    const handleSwissResult = async (matchIndex: number, newWinnerId: string) => {
        if (!appState) return;

        const newMatches = [...appState.matches];
        const match = newMatches[matchIndex];
        const oldWinnerId = match.winnerId;

        if (oldWinnerId === newWinnerId) return; // 既に登録済みならスキップ

        match.winnerId = newWinnerId;

        const updatedPlayers = appState.players.map((p) => {
            let newPoints = p.points;

            if (p.id === oldWinnerId) {
                newPoints -= 3;
            }

            if (p.id === newWinnerId) {
                newPoints += 3;
            }
            
            return { ...p, points: newPoints };
        });
        
        await updateDatabase({ 
            players: updatedPlayers, 
            matches: newMatches 
        });
    };
    // ----------------------------------------------------

    // --- トーナメントの勝敗登録・修正関数 (データベース更新) ---
    const handleTournamentResult = async (stage: 'QF' | 'SF' | 'Finals', matchIndex: number, winner: Top8Player) => {
        if (!appState) return;

        let newMatches: TournamentMatch[];
        let targetMatch: TournamentMatch;
        let newStage: TournamentStage = appState.tournamentStage;
        let finalMatchUpdate: TournamentMatch | null = appState.finalMatch;
        let championUpdate: Top8Player | null = appState.champion;

        if (stage === 'QF') {
            newMatches = [...appState.qfMatches];
            targetMatch = newMatches[matchIndex];
        } else if (stage === 'SF') {
            newMatches = [...appState.sfMatches];
            targetMatch = newMatches[matchIndex];
        } else { // Finals
            if (!appState.finalMatch) return;
            targetMatch = {...appState.finalMatch}; 
            newMatches = [targetMatch]; 
        }

        targetMatch.winner = targetMatch.winner?.id === winner.id ? null : winner;

        if (stage === 'QF') {
            const allQfWinners = newMatches.map(m => m.winner).filter(w => w !== null);
            if (allQfWinners.length === 4) {
                newStage = 'SF';
                const sfPairings: TournamentMatch[] = [
                    { id: 'sf1', player1: allQfWinners[0]!, player2: allQfWinners[1]!, winner: null }, 
                    { id: 'sf2', player1: allQfWinners[2]!, player2: allQfWinners[3]!, winner: null } 
                ];
                await updateDatabase({ qfMatches: newMatches, sfMatches: sfPairings, tournamentStage: newStage });
                return;
            }
            await updateDatabase({ qfMatches: newMatches, tournamentStage: 'QF', sfMatches: [], finalMatch: null, champion: null });
        } else if (stage === 'SF') {
            const allSfWinners = newMatches.map(m => m.winner).filter(w => w !== null);
            if (allSfWinners.length === 2) {
                newStage = 'Finals';
                finalMatchUpdate = { id: 'final', player1: allSfWinners[0]!, player2: allSfWinners[1]!, winner: null };
            } else {
                finalMatchUpdate = null;
                championUpdate = null;
                newStage = 'SF';
            }
            await updateDatabase({ sfMatches: newMatches, finalMatch: finalMatchUpdate, tournamentStage: newStage, champion: championUpdate });
        } else { // Finals
            championUpdate = targetMatch.winner;
            newStage = targetMatch.winner ? 'Champion' : 'Finals';
            await updateDatabase({ finalMatch: targetMatch, champion: championUpdate, tournamentStage: newStage });
        }
    };
    // ----------------------------------------------------

    // トーナメント開始・次ラウンドへ (データベース更新)
    const startNextRound = async () => {
        if (!appState) return;

        const currentRoundNumber = appState.round;

        if (currentRoundNumber > 0) {
            const maxPossiblePoints = currentRoundNumber * 3;
            const activePlayers = appState.players.filter(p => !p.isDropped);
            const undefeatedPlayers = activePlayers.filter(p => p.points === maxPossiblePoints);

            if (undefeatedPlayers.length === 1 || activePlayers.length <= 8) { // 予選終了判定を修正 (参加者が8人以下になった場合も終了)
                const sortedPlayers = [...appState.players]
                    .sort((a, b) => b.points - a.points)
                    .filter(p => !p.isDropped);
                
                const top8 = sortedPlayers.slice(0, 8).map(p => ({ id: p.id, name: p.name }));

                let qfPairings: TournamentMatch[] = [];
                if (top8.length >= 8) {
                    qfPairings = [
                        { id: 'qf1', player1: top8[0], seed1: 1, player2: top8[7], seed2: 8, winner: null }, 
                        { id: 'qf2', player1: top8[3], seed1: 4, player2: top8[4], seed2: 5, winner: null }, 
                        { id: 'qf3', player1: top8[2], seed1: 3, player2: top8[5], seed2: 6, winner: null }, 
                        { id: 'qf4', player1: top8[1], seed1: 2, player2: top8[6], seed2: 7, winner: null }, 
                    ];
                }

                await updateDatabase({ 
                    isTournamentFinished: true, 
                    top8Players: top8,
                    qfMatches: qfPairings,
                    tournamentStage: top8.length >= 8 ? 'QF' : null,
                });
                alert("予選終了。本戦トーナメントに進みます。");
                return; 
            }
        }

        // ドロップしていないプレイヤーのみでマッチング生成
        const activePlayers = appState.players.filter(p => !p.isDropped);
        const newMatches = generatePairings(activePlayers);

        // Byeプレイヤーのポイントをここで即座に更新する
        let updatedPlayers = [...appState.players];
        const byeMatch = newMatches.find((m) => m.player2 === null);

        if (byeMatch) {
            const byePlayerId = byeMatch.player1.id;
            updatedPlayers = updatedPlayers.map((p) => {
                // ドロップしていないプレイヤーのみがByeの対象
                if (p.id === byePlayerId && !p.hasBye && !p.isDropped) {
                    return { ...p, points: p.points + 3, hasBye: true };
                }
                return p;
            });
        }

        // データベースを更新
        await updateDatabase({
            players: updatedPlayers,
            matches: newMatches,
            round: appState.round + 1,
            isTournamentStarted: true,
        });
    };
    
    // データロード中または初期状態
    if (isLoading || !appState) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100">
                <p className="text-xl font-semibold">データをロード中...（初回アクセス時はデータベース初期化中です）</p>
            </div>
        );
    }
    
    // appState をローカル変数に展開
    const { players, matches, round, isTournamentStarted, isTournamentFinished, qfMatches, sfMatches, finalMatch, tournamentStage, champion } = appState;
    
    // --- UIのレンダリング (前回実装したロジックをベースに) ---
    const TournamentMatchDisplay = ({ match, index, stage, handler }: { match: TournamentMatch, index: number, stage: 'QF' | 'SF' | 'Finals', handler: (index: number, winner: Top8Player) => Promise<void> }) => {
        // ... (UIコンポーネントの定義。コードは長いため省略しますが、これは前回のものと同じです) ...
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


    return (
        <div className="min-h-screen bg-gray-100 p-8 font-sans text-gray-900">
            <div className="max-w-2xl mx-auto bg-white shadow-lg rounded-lg p-6">
                <h1 className="text-2xl font-bold mb-6 text-center border-b pb-4">
                    デュエマ 対戦マッチング (DB共有版)
                </h1>

                {/* ===== リセットボタンの場所 ===== */}
                {(isTournamentStarted || players.length > 0) && (
                    <div className="mb-6 flex justify-end">
                        <button
                            onClick={resetTournament}
                            className="bg-red-500 text-white px-4 py-2 rounded font-bold hover:bg-red-600 shadow text-sm"
                        >
                            ⚠️ 大会全体をリセット
                        </button>
                    </div>
                )}
                {/* ============================= */}


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
                        {/* ドロップ機能付きリスト */}
                        <ul className="grid grid-cols-2 gap-2 text-sm">
                            {players.map((p) => (
                                <li key={p.id} className={`flex justify-between items-center px-3 py-1 rounded border ${p.isDropped ? 'bg-red-100 text-gray-500 line-through' : 'bg-gray-50'}`}>
                                    <span className="truncate">{p.name}</span>
                                    <button
                                        onClick={() => togglePlayerDrop(p.id)}
                                        className={`ml-2 px-2 py-0.5 text-xs rounded transition-colors font-semibold ${
                                            p.isDropped
                                                ? 'bg-blue-500 text-white hover:bg-blue-600'
                                                : 'bg-red-500 text-white hover:bg-red-600'
                                        }`}
                                    >
                                        {p.isDropped ? '復帰' : 'ドロップ'}
                                    </button>
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
                        {/* ... (既存のトーナメント表示ロジックは省略) ... */}
                        {isTournamentFinished ? (
                            // --- トーナメント画面 ---
                            <div className="text-center p-8 border-4 border-yellow-500 bg-yellow-50 rounded-lg mb-8">
                                <h2 className="text-2xl font-bold text-yellow-700 mb-4">
                                    {champion ? `👑 優勝者: ${champion.name} 👑` : '🏆 予選スイスドロー終了 🏆'}
                                </h2>
                                
                                <div className="mt-6 border-t pt-4">
                                    <h3 className="font-bold mb-4 text-xl border-b pb-2 text-indigo-700">⚔️ 本戦トーナメント ⚔️</h3>
                                    
                                    {qfMatches.length === 0 ? (
                                        <p className="text-red-500 font-semibold">参加者が8名未満のため、トーナメントはスキップされました。</p>
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
                                            {sfMatches.length > 0 && (
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
                                            {finalMatch && (
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
                                        <td>{p.name} {p.isDropped && <span className="text-red-500">(ドロップ)</span>}</td>
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