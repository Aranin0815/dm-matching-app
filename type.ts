export type Player = {
    id: string;
    name: string;
    points: number;       // 現在の勝ち点
    matchHistory: string[]; // 過去に対戦した相手のIDリスト
    hasBye: boolean;      // 既に不戦勝をもらったか
    isDropped: boolean;   // 途中棄権しているか
  };
  
  export type Match = {
    id: string;
    player1: Player;
    player2: Player | null; // nullなら不戦勝
    winnerId: string | null; // 勝者のID (まだ決まってない場合はnull)
  };