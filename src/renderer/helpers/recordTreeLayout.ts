import { ImmutableNode, ImmutableRecord } from "tsshogi";

export type RecordTreePoint = {
  ply: number;
  lane: number;
};

export type RecordTreeNode = RecordTreePoint & {
  id: number;
  node: ImmutableNode;
  onActiveLine: boolean;
  current: boolean;
};

export type RecordTreeEdge = {
  id: number;
  from: RecordTreePoint;
  to: RecordTreePoint;
  onActiveLine: boolean;
};

export type RecordTreeLayout = {
  nodes: RecordTreeNode[];
  edges: RecordTreeEdge[];
  laneCount: number;
  maxPly: number;
};

type Interval = { start: number; end: number };

function overlaps(intervals: Interval[], start: number, end: number): boolean {
  return intervals.some((interval) => interval.start <= end && start <= interval.end);
}

// 区間 [start, end] が空いている最も左のレーンを探す。(貪欲な区間パッキング)
function allocateLane(lanes: Interval[][], minLane: number, start: number, end: number): number {
  let lane = minLane;
  while (lane < lanes.length && overlaps(lanes[lane], start, end)) {
    lane++;
  }
  while (lanes.length <= lane) {
    lanes.push([]);
  }
  lanes[lane].push({ start, end });
  return lane;
}

type BranchOrigin = {
  point: RecordTreePoint;
  active: boolean;
};

type LineTask = {
  head: ImmutableNode;
  origin: BranchOrigin | null;
};

export function buildRecordTreeLayout(record: ImmutableRecord): RecordTreeLayout {
  const activeLine = new Set<ImmutableNode>(record.moves);
  const nodes: RecordTreeNode[] = [];
  const edges: RecordTreeEdge[] = [];
  const lanes: Interval[][] = [];
  let maxPly = 0;

  // next で連なる一続きのノード列を「ライン」として扱い、ラインごとにレーンを割り当てる。
  // 深い分岐点から処理することで、分岐元から遠いアークが既存のラインをまたぐのを避ける。
  const stack: LineTask[] = [{ head: record.first, origin: null }];
  while (stack.length > 0) {
    const { head, origin } = stack.pop() as LineTask;
    const line: ImmutableNode[] = [];
    for (let node: ImmutableNode | null = head; node; node = node.next) {
      line.push(node);
    }
    const endPly = line[line.length - 1].ply;
    // 分岐元からのアークが進入する行 (head.ply - 1) も含めて区間を確保することで、
    // 別のラインの末尾とドットが縦に隣接して 1 本のラインに見えてしまうのを防ぐ。
    const startPly = origin ? head.ply - 1 : head.ply;
    const lane = allocateLane(lanes, origin ? origin.point.lane + 1 : 0, startPly, endPly);
    maxPly = Math.max(maxPly, endPly);

    const branchTasks: LineTask[] = [];
    let prev = origin;
    for (const node of line) {
      const point = { ply: node.ply, lane };
      const active = activeLine.has(node);
      nodes.push({
        id: nodes.length,
        node,
        ...point,
        onActiveLine: active,
        current: node === record.current,
      });
      if (prev) {
        edges.push({
          id: edges.length,
          from: prev.point,
          to: point,
          onActiveLine: prev.active && active,
        });
      }
      prev = { point, active };
      // このノードから分岐するライン (next の弟ノードたち) を集める。
      // 同じノードからの分岐は先頭の分岐ほど左のレーンに来るよう、逆順に積んでおく。
      const branchHeads: ImmutableNode[] = [];
      for (let b = node.next?.branch ?? null; b; b = b.branch) {
        branchHeads.push(b);
      }
      for (let i = branchHeads.length - 1; i >= 0; i--) {
        branchTasks.push({ head: branchHeads[i], origin: { point, active } });
      }
    }
    // 浅い分岐点から順に積むことで、スタックからは深い分岐点から取り出される。
    stack.push(...branchTasks);
  }

  return { nodes, edges, laneCount: lanes.length, maxPly };
}
