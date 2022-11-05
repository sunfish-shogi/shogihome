// TODO: 定跡を表す Book クラスを実装する。
// 一般の有向グラフを実装するライブラリがあるならば、それを使ったほうが良いか？
// 後に shogi 以下を独立したライブラリとして分離するならば、どこまでの機能をここで実装すればよいか？
// 広まっているチェスのライブラリなども参考にしたい。

import Graph from "graphology";

export class Book {
    graph = new Graph();
    constructor() {
    }
    addNode(sfen: string) {
        this.graph.addNode(sfen);
    }
    dropNode(sfen: string) {
        this.graph.dropNode(sfen);
    }
    setNodeLabel(sfen: string, label: string) {
        this.graph.setNodeAttribute(sfen, "label", label);
    }
    getNodeLabel(sfen: string): string {
        return this.graph.getNodeAttribute(sfen, "label");
    }
    setNodeWeight(sfen: string, weight: number) {
        this.graph.setNodeAttribute(sfen, "weight", weight);
    }
    getNodeWeight(sfen: string): number {
        return this.graph.getNodeAttribute(sfen, "weight");
    }
    addEdge(source: string, target: string, label: string) {
        this.graph.addEdge(source, target, {
            label: label,
            weight: 1
        });
    }
    dropEdge(source: string, target: string) {
        this.graph.dropEdge(source, target);
    }
    export() {
        this.graph.export();
    }
    import(data: any) {
        this.graph.import(data);
    }
}

// export class BookMetadata {
    
// }

// export interface ImmutableBook {

// }

// export default class Book {
//     public metadata: BookMetadata;
//     constructor() {
//         this.metadata = new BookMetadata();
//     }
// }